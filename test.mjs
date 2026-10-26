import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './server.mjs';
import { seedTasks, validateTasks, summarize, filterTasks } from './model.mjs';

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
