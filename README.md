# Anigo WorkBuddy 插件市场

这个仓库只放 WorkBuddy 插件的薄客户端：调用说明和连接配置。**不包含**公司的 skills、方法论、审查源码或任何凭据，这些都在公司服务端。

## 只装一个：anigo-company-skills（Anigo公司技能）

装上即用，不用登录、不用 Node.js。
- 干活用的是 WorkBuddy 自己的模型；公司服务器只按任务发放该项方法和工具包。
- 能做什么以 `list_skills` 返回为准：写剧本、分镜与视频提示词、生图提示词、合规审查、成片上线前检查、piccoma 交付等。
- 做一整集：在对话里说「用公司skill制作<项目>EPxx」。
- 生图、生视频在 WorkBuddy 的 **WorkRally** 应用里生成，提交前会先报花费，等你同意。
- 也可以不装插件：WorkBuddy → MCP 设置里添加远程服务 `https://workbuddy-skills.morphlab.net/mcp`。

## 安装（每人一次）

1. WorkBuddy → 插件 → 插件市场 → 添加市场，填：`https://github.com/wangjunjsd1993-cell/anigo-workbuddy-market.git`
2. 在市场里安装 `anigo-company-skills`。
3. 新开一个对话就能用。

## 已停用的旧试点（2026-11-10）

`anigo-studio`（要登录 Anigo Studio 的端到端产线试点）和 `anigo-script-audit`（要开通码的剧本程序审查试点）已经停用，市场里不再提供。电脑上装过的，请在 WorkBuddy 的插件管理里删除它们，只留 `anigo-company-skills`。
