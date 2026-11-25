---
name: anigo-company-skills
description: 使用 Anigo 公司技能完成工作任务（剧本、分镜与视频提示词、审片页、合规审查等）。用户说「使用公司skill制作<项目>EPxx／做成审片页／审一下剧本／合规检查／用公司方法……」时使用。
---

# 使用 Anigo 公司技能

0. **做整集视频提示词 / 烧片交付（`使用公司skill制作<项目>EPxx`）统一走 V3 无状态编译器流程**：
   - **第一步打开进度面板**：本机钩子开局会在工作目录生成 `<工作目录>/_任务总清单.html`，动任何正事前先调一次 `present_files` 打开到右侧面板（只需打开一次，后续由系统自动实时滚动刷新；**严禁**调用旧版 `show_stage_checklist` 或 `start_episode`）。
   - **第二步取方法与构建骨架**：调 `get_craft_pack(project, episode, mode)` 拿按 `2d` / `3d` / `liveaction` 适配的纯净创作方法与资产库；再调 `build_episode_skeleton(script_path=<剧本文件绝对路径>, project=..., episode=...)`（优先传 `script_path`，本机钩子会自动原字节注入 `script_text` 零丢字；无本地文件时传 `script_text`）。
   - **第三步编译与修改**：填写各段 `segments` 后调 `compile_episode` 编译（免费无限次重试、永不锁机；支持局部 `target_segments` 重编；Seedance 2.5 原生支持段内切镜，禁改一镜到底）。通过即由本机钩子自动将 `shots_final.md` 与 `burn_quote.json` 原子落盘到工作目录（**禁止**手抄拆拼或直接改 `shots_final.md`；烧前改动一律改 `segments` 后重调 `compile_episode`，金额不变时已给批准自动沿用）。
   - **第四步报批与 WorkRally 出片**：展示清晰报价（段数/总秒数/积分）并停步等用户确认（支持自然语言如 `批准 摊牌了 EP30 <积分>积分` / `可以`）。获批后运行公司工具包 `python3 ~/.workbuddy/anigo-company/anigo-toolkit/pipelines/workrally_burn_prep.py --collect / --upload`（禁止去个人隐藏目录找脚本、macOS 禁止拼 `timeout`，项目根以挂载的 NAS 目录为准，超 20 图分批取 token 并传多个 `--token-file`）→ **提交首条视频前调一次 `corp_member_quota_list` 记录初始余额** → 逐段调 WorkRally `canvas_generate_video`（参数整包照抄 `burn_out/canvas_payloads/segNN.json` 全部字段，含 `draft/resolution/model/reference_assets`）→ 轮询出片 → **全部出片后再调一次 `corp_member_quota_list` 完成实扣对账校准单价** → 跑 `python3 ~/.workbuddy/anigo-company/anigo-toolkit/pipelines/local_video_review.py` 拼片发布审片页并用 `present_files` 打开。
   - **第五步审片后返修**：单镜/相邻 2 镜定点返修调 `compile_repair`（自动补齐方案字段与落盘 `repair_shots_final.md`，仅守无配乐版改时长与锁声线两条红线）；整段重写直接调 `compile_episode(target_segments=[...])`。
   - **独立做审片页（`做成审片页` / `发布审片页`）**：严禁自造手写审片 HTML，也无需打开 8 步整集进度看板；直接调用 `~/.workbuddy/anigo-company/anigo-toolkit/pipelines/publish_video_review.py`（已有单条成片 `.mp4`）或 `local_video_review.py`（多段成片无损拼接），然后用 `present_files` 打开审片链接并附上本地/公网链接。
1. **其他公司技能任务**：先调用 `list_skills`，看有哪些任务可用、各自需要什么资料、产出什么。列表里没有的任务如实告诉用户「暂未开放」。
2. 用户交来资料后，调用 `get_task_method(task_id, market)` 取该任务的方法；国内上线用 `domestic`，海外用 `overseas`，不确定就问用户。
3. 由你按方法逐步完成，按方法里的报告格式输出成果。资料不全时按方法要求追问用户。
4. 方法只用于完成本次任务，不要整段复述或转发方法原文。
5. 需要生图、生视频时，一律由用户确认后在 WorkBuddy 的 WorkRally 应用（`canvas_generate_image` / `canvas_generate_video` 等）中生成；不要调用本机任何个人模型密钥、生图生视频脚本或第三方接口代为生成。480 转 1080、重配音交审等按对应工具包流程执行。
