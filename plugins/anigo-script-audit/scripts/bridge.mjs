// Anigo 剧本程序审查 · WorkBuddy 本地桥接（v0.2）
// 只做三件事：本地应答 MCP 握手与工具列表；把 tools/call 转发到公司服务；首次使用时在本机生成个人凭据。
// 本文件不含任何密钥、核心规则或审查源码。个人凭据只保存在本机 ~/.config/anigo-audit/access.json（仅本人可读）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import https from 'node:https';
import dns from 'node:dns';

const endpoint = 'https://audit-pilot.morphlab.net/mcp';
const dir = path.join(os.homedir(), '.config', 'anigo-audit');
const credential = path.join(dir, 'access.json');
const PROTOCOL = '2025-03-26';
const DESC = '程序化剧本检查；结果不代表创作验收。';
const idSchema = { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'], additionalProperties: false };
const TOOLS = [
  { name: 'submit_script_audit', description: DESC, inputSchema: { type: 'object', properties: { script_text: { type: 'string' }, language: { type: 'string', enum: ['zh', 'en'] }, idempotency_key: { type: 'string' } }, required: ['script_text', 'language', 'idempotency_key'], additionalProperties: false } },
  { name: 'get_audit_status', description: DESC, inputSchema: idSchema },
  { name: 'get_audit_report', description: DESC, inputSchema: idSchema },
];
const TOOL_NAMES = new Set(TOOLS.map(t => t.name));

const send = x => process.stdout.write(JSON.stringify(x) + '\n');
const fail = (id, message) => { if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32000, message } }); };
const fingerprint = token => crypto.createHash('sha256').update(token).digest('hex');

function enrollMessage(fp, fresh) {
  return (fresh ? '首次使用：已在你的电脑上生成个人审查凭据（只保存在本机，不会上传）。' : '你的个人审查凭据还没有开通，或已被撤销。')
    + `请把下面这串开通码发给管理员（开通码不是密码，可以发送）：\n${fp}\n管理员开通后，重新发起一次审查即可。不要复制或转发 ~/.config/anigo-audit/access.json。`;
}

// 读取本机凭据；不存在时生成。返回 {token, fresh}；权限不对时抛 'credential'。
function loadOrCreate() {
  if (!fs.existsSync(credential)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(dir, 0o700); } catch {}
    const token = crypto.randomBytes(32).toString('hex');
    const fd = fs.openSync(credential, 'wx', 0o600);
    fs.writeSync(fd, JSON.stringify({ token }));
    fs.closeSync(fd);
    return { token, fresh: true };
  }
  const st = fs.lstatSync(credential);
  if (!st.isFile() || st.isSymbolicLink() || st.size > 4096) throw Error('credential');
  if (process.platform !== 'win32' && ((st.mode & 0o077) !== 0 || st.uid !== process.getuid())) throw Error('credential');
  const { token } = JSON.parse(fs.readFileSync(credential, 'utf8'));
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error('credential');
  return { token, fresh: false };
}

// 本机若有代理虚拟 DNS（198.18/15），改连该域名已核实的 Cloudflare 地址；主机名、SNI 与证书校验保持不变。
const lookup = (host, options, cb) => dns.lookup(host, options, (err, address, family) => {
  const fake = a => typeof a === 'string' && /^198\.(18|19)\./.test(a);
  if (!err && Array.isArray(address) && address.some(x => fake(x.address))) return cb(null, [{ address: '104.21.14.82', family: 4 }]);
  if (!err && fake(address)) return cb(null, '104.21.14.82', 4);
  cb(err, address, family);
});

function forward(message, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(message);
    const req = https.request(endpoint, {
      method: 'POST', lookup,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let size = 0; const parts = [];
      res.on('data', c => { size += c.length; if (size > 1000000) { res.destroy(); reject(Error('service')); } else parts.push(c); });
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) return reject(Error('unauthorized'));
        if (res.statusCode !== 200) return reject(Error('service'));
        try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8'))); } catch { reject(Error('service')); }
      });
      res.on('error', () => reject(Error('service')));
    });
    req.setTimeout(30000, () => { req.destroy(); reject(Error('service')); });
    req.on('error', () => reject(Error('service')));
    req.end(body);
  });
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async line => {
  let m;
  try { m = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }); return; }
  const id = m.id;
  switch (m.method) {
    case 'initialize':
      return send({ jsonrpc: '2.0', id, result: { protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'anigo-script-audit', version: '0.2.0' } } });
    case 'notifications/initialized':
      return;
    case 'ping':
      return send({ jsonrpc: '2.0', id, result: {} });
    case 'tools/list':
      return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    case 'tools/call':
      break;
    default:
      if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method unavailable' } });
      return;
  }
  const name = m.params && m.params.name;
  if (!TOOL_NAMES.has(name)) return fail(id, '只支持提交审查、查询进度和取报告三个操作。');
  let cred;
  try { cred = loadOrCreate(); } catch { return fail(id, '本机个人凭据文件异常（权限必须仅本人可读）。请联系管理员重新开通，不要复制他人的凭据。'); }
  const fp = fingerprint(cred.token);
  if (cred.fresh) return fail(id, enrollMessage(fp, true));
  const params = { name, arguments: (m.params && m.params.arguments) || {} };
  try {
    const reply = await forward({ jsonrpc: '2.0', id, method: 'tools/call', params }, cred.token);
    if (reply && id !== undefined) send(reply);
  } catch (e) {
    if (e.message === 'unauthorized') return fail(id, enrollMessage(fp, false));
    return fail(id, '审查服务暂不可用，请保留任务编号后稍后重试。');
  }
});
