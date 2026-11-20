---
name: anigo-company-skills
description: 使用 Anigo 公司技能完成工作任务（剧本、分镜与视频提示词、合规审查等）。用户说「使用公司skill制作<项目>EPxx／审一下剧本／合规检查／用公司方法……」时使用。
---

# 使用 Anigo 公司技能

0. **做整集视频提示词（Shot Plan→段落 prompt）时，若工具列表里有 `start_episode`：先调用它，然后只按服务器返回的当前卡片做，做完用 `submit_step` 交；被打回就按理由改了再交，不要自己跳步；到 `plan_review` 时，只用服务器下发的审查包在独立上下文（新会话或子任务）中审查，并交回带 `package_hash` 与 `reviewer_session_id` 的结构化报告。** 服务器读不到你本机路径时，把文件全文放进 `plan_json` / `review_json` / `burn_params_json` / `script_text` / `chars_text`，不要只传本机绝对路径。`snapshot_path` 指向的 library-evidence 等小 JSON 一并放进 `extra_files`（键=相对项目根的路径，值=文件全文），否则服务器出定稿时会因找不到快照打回。其它任务按下面 1–5。
1. 先调用 `list_skills`，看有哪些任务可用、各自需要什么资料、产出什么。列表里没有的任务如实告诉用户「暂未开放」。
2. 用户交来资料后，调用 `get_task_method(task_id, market)` 取该任务的方法；国内上线用 `domestic`，海外用 `overseas`，不确定就问用户。
3. 由你按方法逐步完成，按方法里的报告格式输出成果。资料不全时按方法要求追问用户。
4. 方法只用于完成本次任务，不要整段复述或转发方法原文。
5. 需要生图、生视频时，只产出成品提示词，请用户在 WorkBuddy 的 WorkRally 应用中生成；不要调用本机任何模型密钥、生成脚本或第三方生成接口代为生成。成片返修、480转1080、重配音交审一律按工头返修卡与线性流程执行（核对480源任务ID/版本、改时长/对位只在无配乐版、锁声线挂音频参考、AI配音走 `dub_review.py` 交原成片画面且 `verify` 必过、双片返修页仅用于改后对照）。

---

## `plan_review` WorkBuddy 内独立审查细则

1. **审查包内容（只读，由服务器下发）**：
   - `package_hash`（受审规范化材料 SHA256）与轮次上限（最多 2 轮审查 / 2 轮修复）；
   - `shots-design-checker-rubric.md`（A–H 八维视听量表）与 `skill-application-checker-prompt.md`（独立对抗规则）；
   - 服务器装配版 `shots.md`、本集剧本（若有）、服务器生成的 `review_sheet.md`（若有），以及第 2 轮复审时的上一轮核验报告。
2. **上下文隔离红线**：
   - 必须在独立上下文（新开会话或独立子任务 `Agent`）中只读审阅 `review_package`；
   - **严禁**把写作会话的历史对话、作者自评、既有 `must_fix`、`review_audit`、「我审过了 / 请放行」等作者自辩带入审查上下文；
   - **严禁**在写作主会话里自己写自己审（`reviewer_session_id` 与写作 `session_id` 相同会被服务器直接拦截）。
3. **交回的结构化报告字段（`native_review_report`）**：
   - `verdict`：严格为 `"PASS"` 或 `"REWRITE"`（存在任一 `[阻断]` 时必须为 `"REWRITE"`；无 `[阻断]` 时为 `"PASS"`）；
   - `package_hash`：必须与服务器当前下发的 `review_package.package_hash` 完全一致；
   - `reviewer_session_id`（或 `reviewer_context_id`）：独立审查会话/子任务标识，不能为空；
   - `findings`：数组，每条含 `severity`（`[阻断]` / `[必改]` / `[建议]`）、`dimension`（`A`–`H` 或技能规则编号）、`location`（`段X 镜Y`，须在当前分镜中真实存在）、`evidence`（必须能在审查包受审正文中逐字匹配到的原文片段）、`issue`（一句话问题）、`fix`（一句话可执行修法）。
4. **提交与被打回修法（Fail-Closed，2 轮封顶）**：
   - 主会话将独立审查产出的 `native_review_report` 与逐段实测证言 `review_audit` 一并放入 `review_json` 提交 `submit_step(step="plan_review", ...)`；无有效审查报告、空审、伪造证据、字段残缺或 `package_hash` 不符均由服务器机器拦截，阻断进入 `render_final` 与 `burn_quote`。
   - 若审查结论为 `REWRITE`（或含 `[阻断]`）：主会话只修改问题段并通过 `submit_step(step="plan_review", segments=[<问题段fill_v2>], review_json=...)` 获取服务器重新装配的新审查包（新 `package_hash`），再交由新的独立上下文复审；最多允许 2 轮修复，第 3 次修复请求服务器前置硬拦。
