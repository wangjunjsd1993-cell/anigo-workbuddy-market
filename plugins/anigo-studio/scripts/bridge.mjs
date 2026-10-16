// Anigo Studio · WorkBuddy 本地桥接（v0.1）
// 作用：把 WorkBuddy 里的请求转给 Anigo Studio（anigo.ai）上你本人的账号去执行公司产线；本文件不含任何 skills、源码或密钥。
// 登录：在本机浏览器小页面输入 Anigo Studio 账号密码（密码只发往 anigo.ai，不经过对话、不落盘）；只保存会话令牌到
//       ~/.config/anigo-studio/session.json（仅本人可读）。管理员停用账号后令牌立即失效。
// 范围：试点只放行到「剧本＋分镜提示词」为止的确认卡；出正式图、烧片等付费动作不在这里点，请到 anigo.ai 网页操作。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import crypto from 'node:crypto';
import readline from 'node:readline';

const HOST = 'anigo.ai';
const dir = path.join(os.homedir(), '.config', 'anigo-studio');
const sessionFile = path.join(dir, 'session.json');
const PROTOCOL = '2025-03-26';
const ALLOWED_RUN_KINDS = new Set(['make_episode', 'adapt_episode', 'rewrite_episode', 'draft_setei', 'script', 'rewrite_script']);
const RUN_KIND_LABEL = {
  make_episode: '切本集原文并拆设定', adapt_episode: '拆本集设定', rewrite_episode: '整集从拆设定重做',
  draft_setei: '设定图免费打样', script: '生成本集剧本＋分镜提示词', rewrite_script: '重做本集剧本＋分镜提示词',
  generate_setei: '生成正式设定图（付费）', finalize_setei: '设定图付费定稿', rerun_entity: '重出设定图（付费）',
  reburn_segments: '烧视频片段（付费）', repair_segment_text: '修片段文字', direct_compose: '拼正式成片',
};

// ── 网络：本机若有代理虚拟 DNS（198.18/15），经公共 DoH 取真实地址直连；主机名、SNI、证书校验不变 ──
let realIp = null;
function doh(name) {
  return new Promise(resolve => {
    https.get({ host: 'dns.alidns.com', path: `/resolve?name=${name}&type=A`, timeout: 8000 }, res => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => { try { resolve((JSON.parse(b).Answer || []).filter(a => a.type === 1).map(a => a.data)[0] || null); } catch { resolve(null); } });
    }).on('error', () => resolve(null)).on('timeout', function () { this.destroy(); resolve(null); });
  });
}
const fake = a => typeof a === 'string' && /^198\.(18|19)\./.test(a);
const lookup = (host, options, cb) => dns.lookup(host, options, async (err, address, family) => {
  const isFake = !err && (Array.isArray(address) ? address.some(x => fake(x.address)) : fake(address));
  if (!isFake) return cb(err, address, family);
  realIp = realIp || await doh(host);
  if (!realIp) return cb(err || new Error('dns'), address, family);
  return options && options.all ? cb(null, [{ address: realIp, family: 4 }]) : cb(null, realIp, 4);
});

// 握手前断连（请求尚未送达）自动重试两次；请求体都带幂等编号，重试不会重复执行。
async function request(method, p, opts = {}) {
  for (let i = 0; ; i++) {
    try { return await requestOnce(method, p, opts); }
    catch (e) { if (i >= 2 || !e.beforeResponse || !/ECONNRESET|EPIPE|ECONNREFUSED|EAI_AGAIN/.test(String(e.code))) throw e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
}
function requestOnce(method, p, { token, body, timeoutMs = 30000, stream = false } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = { Accept: stream ? 'text/event-stream' : 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    const req = https.request({ host: HOST, path: p, method, headers, lookup }, res => {
      let size = 0; const parts = [];
      res.on('data', c => { size += c.length; if (size > 8_000_000) { res.destroy(); reject(Error('响应过大')); } else parts.push(c); });
      res.on('end', () => {
        const text = Buffer.concat(parts).toString('utf8');
        let json = null; try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, json, text });
      });
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => { req.destroy(Error('timeout')); });
    let responded = false; req.on('response', () => { responded = true; });
    req.on('error', e => { e.beforeResponse = !responded; reject(e); });
    req.end(data || undefined);
  });
}

// ── 会话 ──
function readSession() {
  if (!fs.existsSync(sessionFile)) return null;
  const st = fs.lstatSync(sessionFile);
  if (!st.isFile() || st.isSymbolicLink() || st.size > 4096) return null;
  if (process.platform !== 'win32' && ((st.mode & 0o077) !== 0 || st.uid !== process.getuid())) return null;
  try { const s = JSON.parse(fs.readFileSync(sessionFile, 'utf8')); return typeof s.token === 'string' && s.token.length >= 20 ? s : null; } catch { return null; }
}
function writeSession(s) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); try { fs.chmodSync(dir, 0o700); } catch {}
  const tmp = sessionFile + '.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 }); fs.renameSync(tmp, sessionFile);
}

// 本机登录页：只监听 127.0.0.1，随机端口＋随机路径，10 分钟或登录成功后关闭。
let loginServer = null;
function startLogin() {
  if (loginServer) return Promise.resolve(loginServer.url);
  const nonce = crypto.randomBytes(16).toString('hex');
  const page = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>登录 Anigo Studio</title>
<body style="font-family:system-ui;max-width:420px;margin:60px auto;padding:0 16px">
<h2>登录 Anigo Studio</h2><p>账号密码只发送到 anigo.ai，本机只保存登录后的会话令牌。</p>
<form method=post><p><input name=username placeholder=用户名 required style="width:100%;padding:8px"></p>
<p><input name=password type=password placeholder=密码 required style="width:100%;padding:8px"></p>
<p><button style="padding:8px 20px">登录</button></p></form></body>`;
  return new Promise(resolve => {
    const srv = http.createServer(async (req, res) => {
      if (!req.url.startsWith('/' + nonce)) { res.writeHead(404); return res.end(); }
      if (req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(page); }
      let b = ''; req.on('data', c => { b += c; if (b.length > 4000) req.destroy(); });
      req.on('end', async () => {
        const f = new URLSearchParams(b);
        let msg;
        try {
          const r = await request('POST', '/auth/login', { body: { username: f.get('username') || '', password: f.get('password') || '' } });
          if (r.status === 200 && r.json && r.json.token) {
            writeSession({ token: r.json.token, username: r.json.user && r.json.user.username, saved_at: new Date().toISOString() });
            msg = '登录成功，可以关闭此页，回到 WorkBuddy 继续。';
            setTimeout(() => { srv.close(); loginServer = null; }, 500);
          } else msg = '登录失败：' + ((r.json && r.json.error) || ('HTTP ' + r.status)) + '。返回重试。';
        } catch { msg = '暂时连不上 anigo.ai，请稍后重试。'; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><meta charset=utf-8><body style="font-family:system-ui;max-width:420px;margin:60px auto"><p>${msg}</p></body>`);
      });
    });
    srv.listen(0, '127.0.0.1', () => {
      loginServer = { srv, url: `http://127.0.0.1:${srv.address().port}/${nonce}` };
      setTimeout(() => { try { srv.close(); } catch {} loginServer = null; }, 10 * 60_000).unref();
      resolve(loginServer.url);
    });
  });
}

// ── 工具定义 ──
const str = (description) => ({ type: 'string', description });
const TOOLS = [
  { name: 'studio_login', description: '登录 Anigo Studio（本人账号）。返回一个本机网址，请用户在浏览器打开并输入账号密码；不要在对话里索取或转述密码。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'studio_whoami', description: '查看当前登录的 Anigo Studio 账号。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'studio_list_projects', description: '列出本人在 Anigo Studio 的项目。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'studio_create_project', description: '新建项目。type: 3d/2d/live；origin: cocreate=陪我共创（需 brief，至少10字）/adapt=有原文改编/idea=一键扩写。', inputSchema: { type: 'object', properties: { name: str('项目名'), type: { type: 'string', enum: ['3d', '2d', 'live'] }, origin: { type: 'string', enum: ['cocreate', 'adapt', 'idea'] }, brief: str('共创的初始想法（origin=cocreate 时必填）') }, required: ['name', 'type', 'origin'], additionalProperties: false } },
  { name: 'studio_list_episodes', description: '列出项目的剧集及每集的当前版本号。', inputSchema: { type: 'object', properties: { project_id: str('项目ID') }, required: ['project_id'], additionalProperties: false } },
  { name: 'studio_chat', description: '把用户的话发给该项目在 Anigo Studio 里的产线 Agent（它按公司 SOP 立项、改编、写剧本与分镜），等它回复后返回回复文字与它给出的确认卡。可选绑定某一集：episode_id 与 episode_version_id 要同时给。', inputSchema: { type: 'object', properties: { project_id: str('项目ID'), message: str('要发给产线 Agent 的话'), episode_id: str('可选：剧集ID'), episode_version_id: str('可选：剧集版本ID') }, required: ['project_id', 'message'], additionalProperties: false } },
  { name: 'studio_chat_history', description: '读取该项目最近的产线对话与确认卡。', inputSchema: { type: 'object', properties: { project_id: str('项目ID'), limit: { type: 'integer', minimum: 1, maximum: 50 } }, required: ['project_id'], additionalProperties: false } },
  { name: 'studio_confirm', description: '代用户点「确认」执行一张产线确认卡。试点只放行到剧本＋分镜为止的卡；付费卡会被拒绝。执行前必须先把卡的内容念给用户、得到用户明确同意。', inputSchema: { type: 'object', properties: { project_id: str('项目ID'), proposal_id: str('确认卡ID') }, required: ['project_id', 'proposal_id'], additionalProperties: false } },
  { name: 'studio_run_status', description: '查询一次产线运行的进度。', inputSchema: { type: 'object', properties: { run_id: str('运行ID') }, required: ['run_id'], additionalProperties: false } },
  { name: 'studio_list_artifacts', description: '列出某集当前版本的产物（剧本、分镜、审计报告等）。', inputSchema: { type: 'object', properties: { episode_id: str('剧集ID') }, required: ['episode_id'], additionalProperties: false } },
  { name: 'studio_read_artifact', description: '读取某个文本产物的内容（剧本、分镜、审计报告）。', inputSchema: { type: 'object', properties: { episode_id: str('剧集ID'), artifact_id: str('产物ID') }, required: ['episode_id', 'artifact_id'], additionalProperties: false } },
  { name: 'studio_logout', description: '删除本机保存的 Anigo Studio 会话。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
];

const ok = (id, value) => send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 1) }] } });
const err = (id, message) => send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: message }] } });
const send = x => process.stdout.write(JSON.stringify(x) + '\n');
const enc = encodeURIComponent;

function summarizeMessages(messages, limit) {
  return messages.slice(-limit).map(m => {
    const p = m.payload && typeof m.payload === 'object' ? m.payload : {};
    const out = { seq: m.seq, role: m.role, status: m.status, text: String(m.content || '').slice(0, 4000) };
    const pr = p.proposal;
    if (pr && pr.proposalId) {
      const rk = pr.target && pr.target.runKind;
      out.card = { proposal_id: pr.proposalId, kind: pr.target && pr.target.kind, run_kind: rk || null,
        label: RUN_KIND_LABEL[rk] || pr.title || null, allowed_here: !!rk && ALLOWED_RUN_KINDS.has(rk),
        episode_id: pr.target && pr.target.episodeId, summary: String(pr.summary || pr.description || pr.title || '').slice(0, 1500) };
    }
    if (p.failure) out.failure = p.failure.publicMessage;
    return out;
  });
}

async function handle(name, a, token) {
  const need = r => { if (r.status === 401) throw Error('AUTH'); if (r.status >= 400) throw Error((r.json && r.json.error) || ('HTTP ' + r.status)); return r.json; };
  switch (name) {
    case 'studio_whoami': return need(await request('GET', '/auth/me', { token })).user;
    case 'studio_list_projects': {
      const j = need(await request('GET', '/api/projects', { token }));
      const list = Array.isArray(j) ? j : (j.projects || []);
      return list.map(p => ({ id: p.id, name: p.name, type: p.type, origin: p.origin, created_at: p.created_at }));
    }
    case 'studio_create_project': {
      const body = { name: a.name, type: a.type, origin: a.origin, resolution: '480p' };
      if (a.origin === 'cocreate') { body.projectId = crypto.randomUUID(); body.brief = String(a.brief || ''); }
      return need(await request('POST', '/api/projects', { token, body }));
    }
    case 'studio_list_episodes': {
      const eps = need(await request('GET', `/api/projects/${enc(a.project_id)}/episodes`, { token }));
      const list = Array.isArray(eps) ? eps : (eps.episodes || []);
      const out = [];
      for (const e of list.slice(0, 60)) {
        let current = null;
        try { const v = need(await request('GET', `/api/episodes/${enc(e.id)}/versions`, { token })); current = v.currentVersionId || null; } catch {}
        out.push({ episode_id: e.id, ep: e.ep || e.ep_no || e.epNo, title: e.title, status: e.status, episode_version_id: current });
      }
      return out;
    }
    case 'studio_chat': {
      if (!!a.episode_id !== !!a.episode_version_id) throw Error('episode_id 与 episode_version_id 要同时给，或都不给。');
      const before = need(await request('GET', `/api/projects/${enc(a.project_id)}/agent-chat`, { token }));
      const lastSeq = (before.window && before.window.lastSeq) || 0;
      const turn = crypto.randomUUID();
      const body = { projectId: a.project_id, message: a.message, turnId: `turn:${turn}`, userMessageId: `user:${turn}`, assistantMessageId: `assistant:${turn}` };
      if (a.episode_id) { body.episodeId = a.episode_id; body.episodeVersionId = a.episode_version_id; }
      const r = await request('POST', '/api/agent', { token, body, stream: true, timeoutMs: 15 * 60_000 });
      if (r.status === 401) throw Error('AUTH');
      if (r.status >= 400) throw Error((r.json && r.json.error) || ('HTTP ' + r.status));
      const after = need(await request('GET', `/api/projects/${enc(a.project_id)}/agent-chat`, { token }));
      const fresh = (after.messages || []).filter(m => Number(m.seq) > Number(lastSeq));
      return { new_messages: summarizeMessages(fresh, 20), note: '确认卡里 allowed_here=false 的是付费或超出试点范围的动作，请到 anigo.ai 网页处理。' };
    }
    case 'studio_chat_history': {
      const j = need(await request('GET', `/api/projects/${enc(a.project_id)}/agent-chat`, { token }));
      return summarizeMessages(j.messages || [], a.limit || 20);
    }
    case 'studio_confirm': {
      const j = need(await request('GET', `/api/projects/${enc(a.project_id)}/agent-chat`, { token }));
      const msg = (j.messages || []).slice().reverse().find(m => m.payload && m.payload.proposal && m.payload.proposal.proposalId === a.proposal_id);
      const rk = msg && msg.payload.proposal.target && msg.payload.proposal.target.runKind;
      if (!msg) throw Error('在最近的对话里找不到这张确认卡，请先读取对话记录。');
      if (!rk || !ALLOWED_RUN_KINDS.has(rk)) throw Error(`这张卡是「${RUN_KIND_LABEL[rk] || rk || '非产线动作'}」，不在本插件试点范围内（只到剧本＋分镜）。请到 anigo.ai 网页确认。`);
      const r = await request('POST', `/api/projects/${enc(a.project_id)}/agent-run-dispatch`, { token, body: { proposalId: a.proposal_id, attemptId: crypto.randomUUID() }, timeoutMs: 120000 });
      if (r.status === 401) throw Error('AUTH');
      if (r.status >= 400) throw Error((r.json && r.json.error) || ('HTTP ' + r.status));
      return r.json || { raw: r.text.slice(0, 3000) };
    }
    case 'studio_run_status': return need(await request('GET', `/api/runs/${enc(a.run_id)}/status`, { token }));
    case 'studio_list_artifacts': {
      const j = need(await request('GET', `/api/episodes/${enc(a.episode_id)}/artifacts`, { token }));
      return { episode_version_id: j.episodeVersionId, artifacts: (j.artifacts || []).map(x => ({ artifact_id: x.id, kind: x.kind || x.type, level: x.level, file: String(x.content_ref || '').split('/').slice(-2).join('/'), gate: x.gate && (x.gate.status || x.gate.verdict || null), updated_at: x.updated_at || x.created_at })) };
    }
    case 'studio_read_artifact': {
      const r = await request('GET', `/api/episodes/${enc(a.episode_id)}/artifacts/${enc(a.artifact_id)}/content`, { token, timeoutMs: 60000 });
      if (r.status === 401) throw Error('AUTH');
      if (r.status >= 400) throw Error((r.json && r.json.error) || ('HTTP ' + r.status));
      return r.text.length > 200_000 ? r.text.slice(0, 200_000) + '\n…（内容过长已截断，完整版请到 anigo.ai 查看）' : r.text;
    }
    default: throw Error('未知操作');
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async line => {
  let m; try { m = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }); }
  const id = m.id;
  if (m.method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'anigo-studio', version: '0.1.0' } } });
  if (m.method === 'notifications/initialized') return;
  if (m.method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
  if (m.method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  if (m.method !== 'tools/call') { if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method unavailable' } }); return; }
  const name = m.params && m.params.name; const a = (m.params && m.params.arguments) || {};
  try {
    if (name === 'studio_login') return ok(id, '请在浏览器打开下面这个本机网址登录（10 分钟内有效，只在你这台电脑上能打开）：\n' + await startLogin());
    if (name === 'studio_logout') { try { fs.unlinkSync(sessionFile); } catch {} return ok(id, '已删除本机会话。'); }
    const s = readSession();
    if (!s) return err(id, '还没有登录 Anigo Studio。请先调用 studio_login，让用户在浏览器里登录本人账号。');
    return ok(id, await handle(name, a, s.token));
  } catch (e) {
    if (e.message === 'AUTH') return err(id, 'Anigo Studio 会话已失效或账号被停用。请调用 studio_login 重新登录；仍失败请联系管理员。');
    return err(id, '操作失败：' + e.message);
  }
});
rl.on('close', () => setTimeout(() => process.exit(0), 200));
