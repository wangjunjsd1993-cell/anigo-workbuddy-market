# Anigo WorkBuddy 插件市场（试点）

这个仓库只放 WorkBuddy 插件的薄客户端：调用说明、连接配置和本地桥接程序。**不包含**公司的 skills、方法论、审查源码或任何凭据——这些只在公司服务端运行。仓库公开也不影响安全：没有账号就什么都调不了。

## 插件一：anigo-studio（端到端产线 · 试点 0.1.0）

用你本人的 Anigo Studio 账号，在 WorkBuddy 里按公司 SOP 走：立项／共创 → 改编拆设定 → 设定图免费打样 → 剧本＋分镜提示词，并读回剧本、分镜和审计报告。
试点只到「剧本＋分镜提示词」为止：付费出正式图、定稿、烧视频、拼成片，插件不会替你点确认，请到 anigo.ai 网页操作。

## 插件二：anigo-script-audit（剧本程序审查 · 试点 0.2.0）

把指定剧本提交到公司服务做 7 项程序化检查并取回报告。不做原作对照、创作语义、合规或版权审阅；程序 PASS 不等于作品合格。需要管理员单独开通（首次使用会给出开通码）。

## 安装（每人一次）

1. 电脑上需要 Node.js 18 或更新版本（终端输入 `node -v` 能看到版本号即可）。
2. WorkBuddy → 插件 → 插件市场 → 添加市场，填：`https://github.com/wangjunjsd1993-cell/anigo-workbuddy-market.git`
3. 在市场里安装 `anigo-studio`（需要剧本审查再装 `anigo-script-audit`）。
4. 新开一个对话，说「用公司产线帮我……」。第一次会让你在浏览器里登录 Anigo Studio：账号密码只发给 anigo.ai，不经过对话，本机只保存登录后的会话（`~/.config/anigo-studio/session.json`，仅本人可读）。

还没有 Anigo Studio 账号：找管理员要邀请码，在 anigo.ai 注册。

## 隔离与撤销

- 每个人用自己的账号，只能看到自己的项目和产物。
- 管理员在 Anigo Studio 后台停用账号后，该人的会话立即失效。
- 自己退出：在 WorkBuddy 里说「退出 Anigo Studio」，或删除上面那个会话文件。
