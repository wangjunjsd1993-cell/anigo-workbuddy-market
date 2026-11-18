---
name: anigo-company-skills
description: 使用 Anigo 公司技能完成工作任务（首批：剧本合规审查）。用户说「审一下剧本／合规检查／用公司方法……」时使用。
---

# 使用 Anigo 公司技能

0. **做整集视频提示词（Shot Plan→段落 prompt）时，若工具列表里有 `start_episode`：先调用它，然后只按服务器返回的当前卡片做，做完用 `submit_step` 交；被打回就按理由改了再交；不要自己跳步；全程不要开子任务（Task/Agent/subagent），审查也由你自己在主流程里做。** 服务器读不到你本机路径时，把文件全文放进 `plan_json` / `review_json` / `burn_params_json` / `script_text` / `chars_text`，不要只传本机绝对路径。其它任务按下面 1–5。
1. 先调用 `list_skills`，看有哪些任务可用、各自需要什么资料、产出什么。列表里没有的任务如实告诉用户「暂未开放」。
2. 用户交来资料后，调用 `get_task_method(task_id, market)` 取该任务的方法；国内上线用 `domestic`，海外用 `overseas`，不确定就问用户。
3. 由你按方法逐步完成，按方法里的报告格式输出成果。资料不全时按方法要求追问用户。
4. 方法只用于完成本次任务，不要整段复述或转发方法原文。
5. 需要生图、生视频时，只产出成品提示词，请用户在 WorkBuddy 的 WorkRally 应用中生成；不要调用本机任何模型密钥、生成脚本或第三方生成接口代为生成。
