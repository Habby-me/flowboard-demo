import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './server.mjs';
import { seedTasks, validateTasks, summarize, filterTasks, sortTasks, parseBackup, mergeTasks } from './model.mjs';
import { STORAGE_KEY, RECOVERY_KEY, loadBrowserTasks, saveBrowserTasks, recoverBrowserTasks } from './storage.mjs';

const seeds = () => seedTasks(new Date('2026-10-26T12:00:00Z'));
async function start(dbPath = ':memory:') {
  const server = await createApp({ dbPath });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
async function stop(server) { server.close(); server.closeAllConnections(); await once(server, 'close'); }
const write = (url, tasks, revision, headers = {}) => fetch(`${url}/api/board`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ tasks, expectedRevision: revision }) });

test('shared validation rejects malformed, duplicate, and impossible-date imports', () => {
  const tasks = seeds();
  assert.equal(validateTasks(tasks).length, 9);
  for (const input of [null, {}, [...tasks, tasks[0]], [{ ...tasks[0], title: ' ' }], [{ ...tasks[0], status: '__proto__' }], [{ ...tasks[0], due: '2026-02-31' }], [{ ...tasks[0], id: '<script>' }], Array(501).fill(tasks[0])]) assert.throws(() => validateTasks(input));
});

test('search, member and project filters compose, statistics exclude completed overdue work', () => {
  const tasks = seeds();
  assert.equal(filterTasks(tasks, { query: 'SQLITE', project: 'product' }).length, 1);
  assert.equal(filterTasks(tasks, { query: 'fb-004', assignee: 'H' }).length, 1);
  assert.equal(filterTasks(tasks, { assignee: 'H', priority: 'high' }).length, 2);
  assert.deepEqual(summarize(tasks, '2026-10-26'), { total: 9, done: 3, doing: 3, overdue: 1, percent: 33 });
  assert.equal(summarize([]).percent, 0);
});

test('overdue filters exclude completed work, undated tasks and tasks due today', () => {
  const tasks = [...seeds(), { ...seeds()[0], id: 'undated', due: '' }];
  assert.deepEqual(filterTasks(tasks, { status: 'overdue', today: '2026-10-26' }).map(t => t.id), ['FB-006']);
  assert.equal(filterTasks(tasks, { status: 'done' }).length, 3);
  assert.equal(filterTasks(tasks, { status: 'overdue', assignee: 'H', today: '2026-10-26' }).length, 0);
});

test('sorts preserve the input, place undated work last, and keep equal priorities stable', () => {
  const tasks = [{ ...seeds()[0], id: 'undated', due: '' }, seeds()[0], seeds()[3], seeds()[1]];
  const before = structuredClone(tasks);
  assert.equal(sortTasks(tasks, 'due').at(-1).id, 'undated');
  assert.deepEqual(sortTasks(tasks, 'priority').map(t => t.id), ['undated', 'FB-001', 'FB-004', 'FB-002']);
  assert.equal(sortTasks(seeds(), 'newest')[0].id, 'FB-009');
  assert.deepEqual(sortTasks(tasks, 'manual'), tasks);
  assert.notEqual(sortTasks(tasks), tasks);
  assert.deepEqual(tasks, before);
});

test('backup import accepts v1 and legacy arrays, rejects unknown versions and preserves existing work', () => {
  const current = seeds();
  const incoming = [{ ...current[0], title: 'Updated from backup' }, { ...current[1], id: 'FB-NEW' }];
  for (const payload of [incoming, { app: 'FlowBoard', version: 1, tasks: incoming }]) {
    const merged = mergeTasks(current, parseBackup(JSON.stringify(payload)));
    assert.equal(merged.length, 10);
    assert.equal(merged[0].title, 'Updated from backup');
    assert.equal(merged[1].title, current[1].title);
  }
  assert.equal(current[0].title, seeds()[0].title);
  for (const payload of [null, { tasks: current }, { app: 'FlowBoard', version: 2, tasks: current }, { app: 'Other', version: 1, tasks: current }]) assert.throws(() => parseBackup(JSON.stringify(payload)));
  assert.throws(() => parseBackup('{invalid'));
  assert.throws(() => parseBackup(' '.repeat(2 * 1024 * 1024 + 1)));
});

test('import validates the combined workspace size before replacing any task', () => {
  const full = Array.from({ length: 500 }, (_, i) => ({ ...seeds()[0], id: `TASK-${i}` }));
  assert.throws(() => mergeTasks(full, [{ ...seeds()[0], id: 'EXTRA' }]));
  assert.equal(mergeTasks(full, [{ ...full[0], title: 'Same ID' }]).length, 500);
});

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}

test('browser storage keeps empty workspaces and a recoverable validated snapshot', () => {
  const storage = memoryStorage();
  assert.equal(loadBrowserTasks(storage).length, 9);
  saveBrowserTasks(storage, []);
  assert.deepEqual(loadBrowserTasks(storage), []);
  assert.equal(recoverBrowserTasks(storage).length, 9);
  assert.equal(loadBrowserTasks(storage).length, 9);
});

test('corrupt data is not silently reset and invalid writes cannot overwrite recovery', () => {
  const storage = memoryStorage();
  saveBrowserTasks(storage, seeds());
  saveBrowserTasks(storage, []);
  const recovery = storage.getItem(RECOVERY_KEY);
  storage.setItem(STORAGE_KEY, '{broken');
  assert.throws(() => loadBrowserTasks(storage));
  assert.throws(() => saveBrowserTasks(storage, seeds()));
  assert.equal(storage.getItem(STORAGE_KEY), '{broken');
  assert.equal(storage.getItem(RECOVERY_KEY), recovery);
  assert.equal(recoverBrowserTasks(storage).length, 9);
  assert.throws(() => recoverBrowserTasks(memoryStorage()));
});

test('browser quota errors preserve the previous primary snapshot', () => {
  const storage = memoryStorage();
  saveBrowserTasks(storage, seeds());
  const primary = storage.getItem(STORAGE_KEY);
  const limited = { getItem: storage.getItem, setItem: () => { throw new DOMException('Full', 'QuotaExceededError'); } };
  assert.throws(() => saveBrowserTasks(limited, []));
  assert.equal(storage.getItem(STORAGE_KEY), primary);
});

test('API creates, edits and deletes tasks and persists them across a database restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'flowboard-test-'));
  let instance;
  try {
    const dbPath = join(dir, 'tasks.sqlite');
    instance = await start(dbPath);
    let data = await (await fetch(`${instance.url}/api/board`)).json();
    const task = { ...seeds()[0], id: 'FB-TEST', title: 'A real CRUD round trip' };
    assert.equal((await write(instance.url, [...data.tasks, task], data.revision)).status, 200);
    data = await (await fetch(`${instance.url}/api/board`)).json();
    assert.equal(data.tasks.at(-1).title, task.title);
    assert.equal((await write(instance.url, data.tasks.map(t => t.id === task.id ? { ...t, status: 'done', title: 'Edited' } : t), data.revision)).status, 200);
    await stop(instance.server); instance = await start(dbPath);
    data = await (await fetch(`${instance.url}/api/board`)).json();
    assert.equal(data.tasks.find(t => t.id === task.id).status, 'done');
    assert.equal(data.tasks.find(t => t.id === task.id).title, 'Edited');
    assert.equal((await write(instance.url, data.tasks.filter(t => t.id !== task.id), data.revision)).status, 200);
    data = await (await fetch(`${instance.url}/api/board`)).json();
    assert.equal(data.tasks.some(t => t.id === task.id), false);
    assert.equal(data.revision, 3);
  } finally { if (instance?.server.listening) await stop(instance.server); await rm(dir, { recursive: true, force: true }); }
});

test('simultaneous writers cannot silently overwrite each other', async () => {
  const { server, url } = await start();
  try {
    const data = await (await fetch(`${url}/api/board`)).json();
    const responses = await Promise.all([write(url, [data.tasks[0]], data.revision), write(url, [data.tasks[1]], data.revision)]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    const current = await (await fetch(`${url}/api/board`)).json();
    assert.equal(current.revision, 1); assert.equal(current.tasks.length, 1);
  } finally { await stop(server); }
});

test('bad requests and cross-origin writes preserve stored tasks; private source files are not served', async () => {
  const { server, url } = await start();
  try {
    assert.equal((await write(url, [{ bad: true }], 0)).status, 400);
    assert.equal((await write(url, [], 0, { Origin: 'https://unrelated.example' })).status, 403);
    assert.equal((await write(url, [], 0, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await fetch(`${url}/api/board`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{invalid' })).status, 400);
    assert.equal((await fetch(`${url}/api/board`, { method: 'PUT', body: '{}' })).status, 415);
    assert.equal((await fetch(`${url}/api/board`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${url}/api/unknown`)).status, 404);
    for (const file of ['server.mjs', 'package.json', 'data/flowboard.sqlite', '.git/config']) assert.equal((await fetch(`${url}/${file}`)).status, 404);
    const current = await (await fetch(`${url}/api/board`)).json();
    assert.equal(current.revision, 0); assert.equal(current.tasks.length, 9);
    for (const file of ['', 'app.mjs', 'styles.css', 'favicon.svg']) assert.equal((await fetch(`${url}/${file}`)).status, 200);
  } finally { await stop(server); }
});

test('server declares SQLite mode and static preview declares browser mode without creating a database', async () => {
  const { server, url } = await start();
  const staticServer = await createApp({ staticOnly: true, dbPath: '/not-a-writable-path/unused.sqlite' });
  staticServer.listen(0, '127.0.0.1'); await once(staticServer, 'listening');
  const staticUrl = `http://127.0.0.1:${staticServer.address().port}`;
  try {
    assert.match(await (await fetch(url)).text(), /name="flowboard-storage" content="sqlite"/);
    assert.match(await (await fetch(staticUrl)).text(), /name="flowboard-storage" content="browser"/);
    assert.equal((await fetch(`${staticUrl}/api/board`)).status, 404);
    assert.equal((await fetch(`${staticUrl}/storage.mjs`)).status, 200);
    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
    assert.ok(head.headers.get('content-security-policy').includes("script-src 'self'"));
  } finally { await stop(server); await stop(staticServer); }
});
