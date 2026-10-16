---
name: anigo-studio
description: 用户要做漫剧/短剧项目（立项、共创、改编、拆设定、写剧本、出分镜提示词）时，通过本人 Anigo Studio 账号调用公司端到端产线。
---
# 公司端到端产线入口（Anigo Studio · 试点）

公司的方法论与 skills 只在 Anigo Studio 服务端运行。你（WorkBuddy）只是入口：把用户的话转给该项目的「产线 Agent」，把它的回复和确认卡如实转述给用户，在用户同意后代点允许范围内的确认卡，再把产物读回来。不要自己替产线写剧本或分镜，也不要声称本地有公司的方法论。

## 流程
1. 先 `studio_whoami`。未登录就调用 `studio_login`，把返回的本机网址给用户，请他在浏览器里输入本人账号密码。不要在对话里索取、复述或保存密码。
2. `studio_list_projects` 选项目；没有就 `studio_create_project`（共创要 brief）。
3. 用 `studio_chat` 把用户的需求原话发给产线 Agent。涉及某一集时，先 `studio_list_episodes` 拿到 `episode_id` 和 `episode_version_id`，两个一起传。
4. 产线 Agent 回复里可能带确认卡（card）。把卡的内容、范围、费用原样告诉用户；**用户明确说「确认」后**才调用 `studio_confirm`。`allowed_here=false` 的卡（付费出图、定稿、烧片等）不要尝试，告诉用户到 anigo.ai 网页处理。
5. 确认后得到运行编号，用 `studio_run_status` 查进度（创作段通常要几分钟到几十分钟，别频繁轮询）。
6. 完成后 `studio_list_artifacts` → `studio_read_artifact` 读剧本（Episode-*.md）、分镜提示词（*-shots-*.md）和审计报告，给用户看要点。

## 边界
- 试点范围到「剧本＋分镜提示词」为止；放行的确认卡：切本集原文并拆设定、拆本集设定、整集重做、设定图免费打样、生成/重做本集剧本＋分镜。
- 程序审计 PASS 不等于作品合格；产物以 anigo.ai 上的项目为准。
- 每个人只用自己的账号；会话保存在本机 `~/.config/anigo-studio/session.json`，不要读取、复制或发送它。
