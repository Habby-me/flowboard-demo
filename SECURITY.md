# Security policy

FlowBoard 是一个单人演示项目。SQLite 服务仅监听 `127.0.0.1`，不提供账号认证、多人权限管理或远程数据库访问。

## Reporting a vulnerability

请优先使用仓库 **Security → Report a vulnerability**，如果该入口可用。若没有私密报告入口，请创建一个仅说明「需要私密联系维护者报告安全问题」的 Issue，等待确认安全沟通方式；不要公开利用步骤、私人数据或凭据。

## Supported versions

只维护最新发布版本。修复会在变更日志中说明，版本发布前请先备份任务数据。

## Boundaries

- GitHub Pages / 静态演示的数据只在当前浏览器保存。
- Node.js 模式仅适合本机工作空间，不应直接暴露到公网。
- 请勿把真实客户、团队机密或身份资料放入公开演示数据、Issue 或截图。
- 浏览器端对任务文字转义，后端校验请求并使用参数化 SQL；这些措施不能替代生产环境的认证和授权。
