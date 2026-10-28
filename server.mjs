import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedTasks, validateTasks } from './model.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const webFiles = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/styles.css': ['styles.css', 'text/css'], '/app.mjs': ['app.mjs', 'text/javascript'], '/model.mjs': ['model.mjs', 'text/javascript'], '/storage.mjs': ['storage.mjs', 'text/javascript'], '/icons.mjs': ['icons.mjs', 'text/javascript'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };

export async function createApp({ dbPath = join(root, 'data', 'flowboard.sqlite'), staticOnly = false } = {}) {
  if (!staticOnly && dbPath !== ':memory:') await mkdir(dirname(dbPath), { recursive: true });
  const db = staticOnly ? null : new DatabaseSync(dbPath);
  if (db) {
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS board (id INTEGER PRIMARY KEY CHECK(id=1), tasks TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0)');
    if (!db.prepare('SELECT id FROM board WHERE id=1').get()) db.prepare('INSERT INTO board (id,tasks,revision) VALUES (1,?,0)').run(JSON.stringify(seedTasks()));
  }
  const server = createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        if (staticOnly) return send(404, { error: '静态预览使用浏览器存储。' });
        if (url.pathname !== '/api/board') return send(404, { error: '接口不存在。' });
        if (req.method === 'GET') {
          const board = db.prepare('SELECT tasks,revision FROM board WHERE id=1').get();
          return send(200, { tasks: JSON.parse(board.tasks), revision: board.revision });
        }
        if (req.method !== 'PUT') { res.setHeader('Allow', 'GET, PUT'); return send(405, { error: '不支持的请求方法。' }); }
        // Bind to loopback and reject cross-origin writes; the demo is a local workspace.
        const origin = req.headers.origin;
        if (req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: '不允许跨站点写入。' });
        if (origin && !['http://localhost', 'http://127.0.0.1', 'http://[::1]'].some(base => origin === `${base}:${server.address().port}`)) return send(403, { error: '不允许跨来源写入。' });
        if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) return send(415, { error: '请发送 JSON 数据。' });
        const parts = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 2 * 1024 * 1024) { req.resume(); return send(413, { error: '请求数据不能超过 2 MB。' }); } parts.push(chunk); }
        let body;
        try { body = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { return send(400, { error: '无效的 JSON 数据。' }); }
        let tasks;
        try { if (!body || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) throw new Error('缺少有效的数据版本。'); tasks = validateTasks(body.tasks); } catch (error) { return send(400, { error: error.message }); }
        const result = db.prepare('UPDATE board SET tasks=?,revision=revision+1 WHERE id=1 AND revision=?').run(JSON.stringify(tasks), body.expectedRevision);
        if (!result.changes) return send(409, { error: '数据已被另一个窗口修改。已刷新看板，请重新编辑。' });
        return send(200, { revision: body.expectedRevision + 1 });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, { error: '不支持的请求方法。' });
      const file = webFiles[url.pathname];
      if (!file) return send(404, { error: '页面不存在。' });
      let content = await readFile(join(root, file[0]));
      if (!staticOnly && file[0] === 'index.html') content = Buffer.from(content.toString().replace('name="flowboard-storage" content="browser"', 'name="flowboard-storage" content="sqlite"'));
      res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      console.error('Request failed:', error.message);
      if (!res.headersSent) send(500, { error: '服务暂时不可用，请稍后重试。' }); else res.end();
    }
  });
  server.on('close', () => db?.close());
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 3000);
  const server = await createApp({ staticOnly: process.argv.includes('--static') });
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请使用 PORT=3001 npm start。` : error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`FlowBoard is ready: http://127.0.0.1:${server.address().port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(() => process.exit(0)); server.closeIdleConnections(); });
}
