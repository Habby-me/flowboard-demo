# Contributing to FlowBoard

感谢你帮助完善这个小项目。功能范围、已知限制和计划见 [README](README.md) 与 [Roadmap](docs/ROADMAP.md)。

## 本地开发

1. 使用 Node.js 22.13+，建议 `nvm use` 选择 Node 24。
2. `npm start` 启动 SQLite 模式；`npm run preview` 启动浏览器存储模式。
3. 修改后运行 `npm run verify`。本项目没有第三方运行依赖，无需 `npm install`。
4. 在桌面和窄屏浏览器检查受影响的界面。验证任务和备份时使用测试数据。

## 提交改动

- 一次 PR 解决一个明确的问题；较大的功能先开 Issue 讨论场景和验收标准。
- 从最新 `main` 创建分支。`feat:`、`fix:`、`docs:`、`test:`、`ci:` 可用于说明提交目的。
- 行为变化要增加能复现问题的测试；不要只测试内部实现细节。
- 修改存储格式时，应明确向后兼容和恢复方式，避免覆盖已有任务。
- 更新相关文档与 `CHANGELOG.md`；UI 改动附上截图和验证方式。
- 提交中不包含个人任务、数据库、凭据或构建产物。

## 反馈问题

使用仓库的 Bug report 或 Feature request 模板。请写清运行模式、版本、复现步骤和期望结果，不要只贴报错截图。

安全问题请先阅读 [SECURITY.md](SECURITY.md)，不要在公开 Issue 中包含敏感细节。
