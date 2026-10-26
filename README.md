# FlowBoard · 轻量项目协作 Demo

把想法、任务和进展放在一起的项目看板。包含完整的任务操作、响应式界面和可实际运行的 Node.js + SQLite 后端。

**在线演示：** https://flowboard-habby-demo.savorychord10.chatgpt.site （私有访问，需要以创建者账号打开）

## 快速开始

需要 Node.js **22.13 或以上版本**（建议 24 LTS）。使用 Node.js 自带模块，**无需安装依赖，也不需要 API Key**。

```bash
git clone https://github.com/Habby-me/flowboard-demo.git
cd flowboard-demo
npm start
```

打开 **http://127.0.0.1:3000**。首次启动会创建 `data/flowboard.sqlite` 并写入 9 条示例任务。停止后重启，数据仍然保留。

```bash
npm run dev    # 文件变化时重启服务
npm test       # 输入校验、筛选统计、CRUD、持久化、并发冲突、请求边界测试
npm run check  # JavaScript 语法检查
npm run build  # 生成 dist/ 静态演示版
PORT=3001 npm start  # 端口被占用时使用其他端口
```

## 功能

- 任务创建、编辑、删除及短时间内撤销删除。
- 三列看板：待开始、进行中、已完成；支持桌面拖拽和表单状态切换。
- 看板与列表视图，按项目、优先级、负责人筛选，支持标题、描述、标签、编号搜索。
- 「我的任务」及项目概览，实时计算进度、完成率和逾期任务。
- JSON 导入、导出，导入前校验结构，按编号合并重复任务，可撤销导入。
- 明暗主题、移动端导航、键盘快捷键、最近操作记录。
- 后端采用数据版本检测，拒绝过期版本覆盖，避免多窗口静默丢失修改。

快捷键：`⌘/Ctrl + K` 搜索，`N` 新建，`Esc` 关闭弹窗。所有可拖拽任务也可通过键盘打开编辑窗口修改状态。

## 技术与结构

| 文件 | 用途 |
| --- | --- |
| `index.html` | 语义化页面、原生 dialog 和表单 |
| `styles.css` | 响应式布局、CSS 变量、明暗主题 |
| `app.mjs` | ES Modules 前端、事件委托、交互与存储适配 |
| `model.mjs` | 前后端共用的校验、筛选、统计和示例数据 |
| `icons.mjs` / `favicon.svg` | 本地 SVG 图标资源 |
| `server.mjs` | Node.js HTTP 服务、REST API、SQLite 存储 |
| `test.mjs` | Node.js test runner 自动化集成测试 |
| `build.mjs` | 生成可独立托管的静态文件 |

后端使用 Node.js 的 `node:sqlite` 模块；部分 Node.js 版本会显示实验性提示，属预期行为。数据库内容通过参数化 SQL 写入。服务默认仅监听本机，静态资源使用白名单，任务文本在渲染前转义。

## 两种运行模式

| | 本地完整模式 | 在线静态演示 |
| --- | --- | --- |
| 运行方式 | `npm start` | 托管 `dist/` |
| 保存位置 | SQLite 数据库 | 当前浏览器 localStorage |
| 刷新保留数据 | 是 | 是 |
| 主要交互 | 全部支持 | 全部支持 |
| 跨设备共享 | 未实现 | 未实现 |

`localhost` / `127.0.0.1` 页面会连接 Node.js API；其他域名使用浏览器本地存储。若要本机验证静态版，请使用普通自定义域名或调整 `load()` 中的模式选择，不能用纯静态服务在 localhost 冒充完整后端。浏览器清除站点数据会清空在线演示的任务，请用导出功能备份。外部字体不可达时会回退到系统字体，功能不受影响。

## API

- `GET /api/board` → `{ tasks, revision }`
- `PUT /api/board`，请求体 `{ tasks, expectedRevision }` → `{ revision }`
- 返回 `400`：数据不合法；`409`：数据版本冲突；`413`：数据超过 2 MB。
- 单个工作空间最多 500 项任务；导入与 API 使用同一套校验。

这是适合演示和继续开发的**单机工作空间**。头像与负责人是演示角色，尚未提供账号认证、多人实时协作、附件或生产环境部署配置。请保持默认本机监听范围；真正多人上线需要增加身份认证、授权及服务端访问控制。

技术参考：[Node.js HTTP](https://nodejs.org/api/http.html)、[Node.js SQLite](https://nodejs.org/api/sqlite.html)、[MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)、[MDN Drag and Drop](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API)。
