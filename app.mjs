import { STATUSES, PRIORITIES, PROJECTS, MEMBERS, seedTasks, validateTasks, filterTasks, summarize, localDate } from './model.mjs';
import { icon } from './icons.mjs';

const $ = (selector) => document.querySelector(selector);
const escape = (value) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const STORAGE_KEY = 'flowboard.tasks.v1';
const state = { tasks: [], query: '', project: 'all', priority: 'all', assignee: 'all', page: 'board', view: 'board', revision: 0, backend: false, saving: false, activity: [], theme: 'light' };
let toastTimer, undoAction, deleteArmed = false;

function toast(message, undo) {
  clearTimeout(toastTimer);
  undoAction = undo;
  $('#toast').innerHTML = `${escape(message)}${undo ? '<button type="button" data-action="undo">撤销</button>' : ''}`;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => { $('#toast').classList.remove('visible'); undoAction = undefined; }, undo ? 10000 : 4500);
}

function record(message) {
  state.activity.unshift({ message, time: new Date().toISOString() });
  state.activity = state.activity.slice(0, 30);
  try { localStorage.setItem('flowboard.activity.v1', JSON.stringify(state.activity)); } catch { /* Activity is optional; task writes report failures separately. */ }
}

async function request(path, options) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers }, signal: AbortSignal.timeout(8000) });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 409) {
      const fresh = await request('/api/board');
      state.tasks = validateTasks(fresh.tasks); state.revision = fresh.revision; renderContent();
    }
    throw new Error(data.error || '保存失败，请稍后重试。');
  }
  return data;
}

async function load() {
  try {
    state.theme = localStorage.getItem('flowboard.theme') || 'light';
    const activity = JSON.parse(localStorage.getItem('flowboard.activity.v1') || '[]');
    if (Array.isArray(activity)) state.activity = activity.filter(a => a && typeof a.message === 'string' && Number.isFinite(Date.parse(a.time))).slice(0, 30);
  } catch { /* Optional preferences can be reset without touching task data. */ }
  document.documentElement.dataset.theme = state.theme;
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    const data = await request('/api/board');
    state.tasks = validateTasks(data.tasks); state.revision = data.revision; state.backend = true;
  } else {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.tasks = raw === null ? seedTasks() : validateTasks(JSON.parse(raw));
    if (raw === null) localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  }
  renderShell();
}

async function persist(tasks, message) {
  if (state.saving) throw new Error('上一项操作正在保存，请稍候。');
  const normalized = validateTasks(tasks);
  state.saving = true;
  try {
    if (state.backend) {
      const result = await request('/api/board', { method: 'PUT', body: JSON.stringify({ tasks: normalized, expectedRevision: state.revision }) });
      state.revision = result.revision;
    } else localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    state.tasks = normalized;
    if (message) record(message);
    renderContent();
  } catch (error) {
    if (error.name === 'QuotaExceededError' || error.name === 'SecurityError') throw new Error('浏览器无法保存数据。请检查存储权限或导出备份后清理空间。');
    throw error;
  } finally { state.saving = false; }
}

const avatar = (id, cls = '') => `<span class="avatar avatar-${id} ${cls}" title="${MEMBERS[id]}">${id === 'H' ? 'H' : MEMBERS[id].slice(0, 1)}</span>`;
function renderShell() {
  $('#app').innerHTML = `<div class="shell">
    <div class="sidebar-backdrop" data-action="menu"></div>
    <aside class="sidebar" aria-label="工作空间导航">
      <a class="brand" href="#" data-action="home"><span class="brand-mark">f</span>flowboard<span style="color:#8191a2;font-size:9px;letter-spacing:0;align-self:start;margin-top:8px">®</span></a>
      <div class="workspace"><span class="workspace-icon">H.</span><div><strong>Habby 的工作空间</strong><small>PERSONAL WORKSPACE</small></div></div>
      <div class="nav-label">工作空间</div>
      <nav class="nav-list">
        <button class="nav-item" data-page="overview">${icon('grid')}项目概览</button>
        <button class="nav-item active" data-page="board">${icon('board')}项目看板<span class="nav-count" id="nav-total">${state.tasks.length}</span></button>
        <button class="nav-item" data-page="mine">${icon('circleCheck')}我的任务<span class="nav-count" id="nav-mine"></span></button>
      </nav>
      <div class="project-nav"><div class="nav-label">我的项目</div>${Object.entries(PROJECTS).map(([id, title]) => `<button class="project-item" data-project="${id}"><span class="project-dot ${id}"></span>${title}</button>`).join('')}</div>
      <div class="sprint-card"><span>${icon('bolt')}<strong>每一步，都算数。</strong></span><p>把注意力留给重要的事，<br>让每一个想法，走向完成。</p><div class="sprint-line"><span id="side-progress"></span></div><div class="sprint-caption"><span>当前完成进度</span><span id="side-percent"></span></div></div>
      <div class="sidebar-footer"><button class="nav-item" data-action="help">${icon('help')}使用指南</button><button class="icon-button" data-action="theme" aria-label="切换明暗主题">${icon(state.theme === 'dark' ? 'sun' : 'moon')}</button></div>
    </aside>
    <main class="main"><header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" data-action="menu" aria-label="打开导航">${icon('menu')}</button><span>工作空间</span><span>/</span><strong id="breadcrumb-page">项目看板</strong></div><div class="top-actions"><label class="search-box" style="margin:0">${icon('search')}<input id="search" type="search" aria-label="搜索任务" placeholder="搜索任务、标签或编号…" maxlength="100"><kbd>⌘ K</kbd></label><span class="top-divider"></span><button class="icon-button bell-button" data-action="activity" aria-label="最近动态">${icon('bell')}</button>${avatar('H', 'user-avatar')}</div></header><div class="content" id="content"></div></main>
  </div>`;
  renderContent();
}

function visibleTasks() {
  return filterTasks(state.tasks, { ...state, assignee: state.page === 'mine' ? 'H' : state.assignee });
}

function renderContent() {
  const tasks = visibleTasks();
  const scoped = state.tasks.filter(t => (state.project === 'all' || t.project === state.project) && (state.page !== 'mine' || t.assignee === 'H'));
  const summary = summarize(scoped);
  const global = summarize(state.tasks);
  const titles = { board: '项目看板', overview: '项目概览', mine: '我的任务' };
  $('#breadcrumb-page').textContent = titles[state.page];
  $('#nav-total').textContent = state.tasks.length;
  $('#nav-mine').textContent = state.tasks.filter(t => t.assignee === 'H' && t.status !== 'done').length;
  $('#side-progress').style.width = `${global.percent}%`;
  $('#side-percent').textContent = `${global.percent}%`;
  document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === state.page));
  document.querySelectorAll('[data-project]').forEach(button => button.classList.toggle('selected', button.dataset.project === state.project));
  const heading = state.page === 'mine' ? '专注此刻，完成重要的小事。' : state.page === 'overview' ? '每一点进展，都清晰可见。' : '让好想法，有条不紊地发生。';
  const hint = state.page === 'mine' ? '这里是分配给 Habby 的任务，给今天一点清晰的方向。' : '一个轻盈的工作空间，把计划、协作与进展，放在一起。';
  $('#content').innerHTML = `<div class="page-heading"><div><span class="eyebrow"><span class="tiny-dot"></span>YOUR IDEAS, IN MOTION</span><h1>${heading}</h1><p>${hint}</p></div><div class="heading-controls"><button class="button" data-action="import">${icon('upload')}<span class="import-label">导入</span></button><button class="button" data-action="export">${icon('download')}<span class="export-label">导出数据</span></button><button class="button primary" data-action="new">${icon('plus')}新建任务</button><input id="import-file" type="file" accept="application/json,.json" class="sr-only" aria-label="选择任务备份文件"></div></div>
    <section class="stats" aria-label="${state.project === 'all' ? '全部项目' : PROJECTS[state.project]}任务统计">${[
      ['grid', '全部任务', summary.total, '让目标清晰可见'],
      ['clock', '进行中', summary.doing, '正在向前推进'],
      ['circleCheck', '已完成', summary.done, `完成率 ${summary.percent}%`],
      ['flag', '待关注', summary.overdue, summary.overdue ? '已过截止日期' : '一切都在计划中']
    ].map(([symbol, label, value, note]) => `<div class="stat-card"><div class="stat-top"><span class="stat-symbol">${icon(symbol)}</span>${label}</div><div class="stat-bottom"><span class="stat-value">${String(value).padStart(2, '0')}</span><span class="stat-note">${note}</span></div><div class="stat-decor" aria-hidden="true">${[9, 15, 12, 22, 18, 26].map(height => `<i style="height:${height}px"></i>`).join('')}</div></div>`).join('')}</section>
    <section class="board-section" aria-label="任务工作区"><div class="section-heading"><div class="section-title"><h2>${state.project === 'all' ? (state.page === 'mine' ? '我的工作清单' : '全部项目') : PROJECTS[state.project]}</h2><span class="demo-badge">DEMO 1.0</span></div><div class="collaborators"><div class="avatar-stack">${Object.keys(MEMBERS).map(id => avatar(id)).join('')}</div><span>演示成员</span></div></div>
    <div class="board-toolbar">${state.page !== 'overview' ? `<div class="view-switch" aria-label="视图切换"><button class="view-button ${state.view === 'board' ? 'active' : ''}" data-view="board" aria-pressed="${state.view === 'board'}">${icon('board')}看板</button><button class="view-button ${state.view === 'list' ? 'active' : ''}" data-view="list" aria-pressed="${state.view === 'list'}">${icon('list')}列表</button></div>` : '<span class="results-count">项目进展一览</span>'}
    <div class="filters"><select id="project-filter" aria-label="筛选项目"><option value="all">全部项目</option>${Object.entries(PROJECTS).map(([id, title]) => `<option value="${id}" ${state.project === id ? 'selected' : ''}>${title}</option>`).join('')}</select>${state.page !== 'overview' ? `<select id="priority-filter" aria-label="筛选优先级"><option value="all">全部优先级</option>${Object.entries(PRIORITIES).map(([id, title]) => `<option value="${id}" ${state.priority === id ? 'selected' : ''}>${title}</option>`).join('')}</select>${state.page !== 'mine' ? `<select id="assignee-filter" aria-label="筛选负责人"><option value="all">全部成员</option>${Object.entries(MEMBERS).map(([id, title]) => `<option value="${id}" ${state.assignee === id ? 'selected' : ''}>${title}</option>`).join('')}</select>` : ''}<span class="results-count">${tasks.length} 个任务</span>` : ''}${state.project !== 'all' || state.priority !== 'all' || state.assignee !== 'all' || state.query ? '<button class="reset-filters" data-action="reset-filters">重置</button>' : ''}</div></div>
    ${state.page === 'overview' ? overview(scoped) : state.view === 'list' ? list(tasks) : board(tasks)}</section>
    <footer class="page-footer"><span class="storage-state"><span class="storage-dot"></span>${state.backend ? 'SQLite · 已保存至本机数据库' : '浏览器本地存储 · 自动保存'}<span class="storage-tip">&nbsp; / &nbsp;${state.backend ? '单机工作空间' : '当前浏览器专属'}</span></span><a href="https://github.com/Habby-me/flowboard-demo" target="_blank" rel="noopener noreferrer">${icon('github')}FlowBoard · 从想法到完成 ${icon('arrow')}</a></footer>`;
}

function dueLabel(task) {
  const today = localDate();
  if (!task.due) return '未设截止日期';
  if (task.due === today) return '今天';
  const [, month, day] = task.due.split('-');
  return `${Number(month)}月${Number(day)}日`;
}

function board(tasks) {
  return `<div class="kanban">${Object.entries(STATUSES).map(([id, label]) => {
    const columnTasks = tasks.filter(t => t.status === id);
    return `<section class="column" data-status="${id}" aria-label="${label}任务列"><div class="column-head"><div class="column-title"><span class="status-dot ${id}"></span>${label}<span class="column-count">${columnTasks.length}</span></div><button class="icon-button" data-action="new" data-status="${id}" aria-label="在${label}中新建任务">${icon('plus')}</button></div><div class="task-list">${columnTasks.map(card).join('') || `<div class="empty">${state.query || state.priority !== 'all' || state.assignee !== 'all' ? '没有匹配的任务' : '留一点空间，给下一个想法。'}<br><small>点击下方按钮添加任务</small></div>`}</div><button class="add-task" data-action="new" data-status="${id}">${icon('plus')}添加任务</button></section>`;
  }).join('')}</div>`;
}

function card(task) {
  const overdue = task.due && task.due < localDate() && task.status !== 'done';
  return `<article class="task-card" draggable="true" tabindex="0" role="button" data-task="${escape(task.id)}" aria-label="编辑任务：${escape(task.title)}"><div class="card-meta"><span class="tag ${task.project}">${escape(task.tag || PROJECTS[task.project])}</span><span class="card-menu" aria-hidden="true">${icon('more')}</span></div><h3>${escape(task.title)}</h3><p>${escape(task.description || '还没有描述，点击补充你的想法。')}</p><div class="card-detail"><span class="priority ${task.priority}">${icon('flag')}${PRIORITIES[task.priority]}</span><span class="task-id">${escape(task.id)}</span></div><div class="card-footer"><span class="due ${overdue ? 'overdue' : ''}" title="${overdue ? '已逾期 · ' : ''}${task.due || '未设置'}">${icon('calendar')}${dueLabel(task)}${overdue ? ' · 已逾期' : ''}</span>${avatar(task.assignee)}</div></article>`;
}

function list(tasks) {
  return `<div class="table-wrap">${tasks.length ? `<table><thead><tr><th>任务名称</th><th>项目</th><th>状态</th><th>优先级</th><th>负责人</th><th>截止日期</th></tr></thead><tbody>${tasks.map(task => `<tr tabindex="0" data-task="${escape(task.id)}" aria-label="编辑任务：${escape(task.title)}"><td><span class="table-title">${escape(task.title)}</span><span class="table-id">${escape(task.id)}</span></td><td><span class="tag ${task.project}">${PROJECTS[task.project]}</span></td><td><span class="table-status"><span class="status-dot ${task.status}"></span>${STATUSES[task.status]}</span></td><td><span class="priority ${task.priority}">${PRIORITIES[task.priority]}</span></td><td>${avatar(task.assignee)} ${MEMBERS[task.assignee]}</td><td>${task.due || '未设置'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">没有找到匹配的任务，试试调整筛选条件。</div>'}</div>`;
}

function overview(tasks) {
  const summary = summarize(tasks);
  return `<div class="overview"><div class="overview-panel"><h3>任务完成情况</h3><div class="progress-overview"><svg class="ring" viewBox="0 0 160 160" role="img" aria-label="完成率 ${summary.percent}%"><circle cx="80" cy="80" r="60" fill="none" stroke="var(--soft)" stroke-width="13"/><circle cx="80" cy="80" r="60" fill="none" stroke="#83a57c" stroke-width="13" stroke-linecap="round" stroke-dasharray="${summary.done ? summary.percent * 3.77 : 0} 377" transform="rotate(-90 80 80)"/><text x="80" y="85" text-anchor="middle">${summary.percent}%</text><text x="80" y="106" text-anchor="middle" style="font-size:9px;font-weight:400;fill:var(--muted)">已完成</text></svg><div class="progress-legend">${Object.entries(STATUSES).map(([id, title]) => `<div><span class="status-dot ${id}"></span>${title} &nbsp; ${tasks.filter(t => t.status === id).length}</div>`).join('')}</div></div></div><div class="overview-panel"><h3>各项目进度</h3>${Object.entries(PROJECTS).filter(([id]) => state.project === 'all' || state.project === id).map(([id, title]) => { const s = summarize(tasks.filter(t => t.project === id)); return `<div class="project-progress"><div class="progress-caption"><span>${title}</span><span>${s.done} / ${s.total} · ${s.percent}%</span></div><div class="progress-track"><div class="progress-fill ${id}" style="width:${s.percent}%"></div></div></div>`; }).join('')}</div><div class="overview-note">${icon('bolt')}<p><strong>${summary.overdue ? `有 ${summary.overdue} 项任务需要你的关注` : '按自己的节奏，让进展持续发生。'}</strong>${summary.overdue ? '回到项目看板，查看标注「已逾期」的任务，调整计划或更新状态。' : '所有图表都来自真实任务数据。完成一项任务，就能看到这里发生变化。'}</p></div></div>`;
}

function openTask(id, status = 'todo') {
  const task = state.tasks.find(t => t.id === id);
  const form = $('#task-form'); form.reset();
  const values = task || { id: '', title: '', description: '', project: state.project === 'all' ? 'product' : state.project, status, priority: 'medium', assignee: 'H', due: localDate(), tag: '' };
  for (const [key, value] of Object.entries(values)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value;
  $('#task-dialog-title').textContent = task ? '编辑任务' : '新建任务';
  $('#save-task').textContent = task ? '保存修改' : '创建任务';
  $('#delete-task').hidden = !task; $('#delete-task').textContent = '删除任务'; deleteArmed = false;
  $('#form-error').textContent = '';
  $('#task-dialog').showModal();
  form.elements.namedItem('title').focus();
}

function info(title, content) {
  $('#info-content').innerHTML = `<div class="dialog-heading"><div><span class="eyebrow">FLOWBOARD WORKSPACE</span><h2 id="info-title">${title}</h2></div><button class="icon-button" data-action="close-info" aria-label="关闭提示窗口">${icon('close')}</button></div><div class="info-body">${content}</div>`;
  $('#info-dialog').showModal();
}

document.addEventListener('click', async event => {
  const nav = event.target.closest('[data-page]');
  if (nav) { state.page = nav.dataset.page; state.project = 'all'; state.priority = 'all'; state.assignee = 'all'; renderContent(); $('.sidebar').classList.remove('open'); $('.sidebar-backdrop').classList.remove('open'); return; }
  const project = event.target.closest('[data-project]');
  if (project) { state.project = state.project === project.dataset.project ? 'all' : project.dataset.project; if (state.page === 'overview') state.page = 'board'; renderContent(); $('.sidebar').classList.remove('open'); $('.sidebar-backdrop').classList.remove('open'); return; }
  const view = event.target.closest('[data-view]');
  if (view) { state.view = view.dataset.view; renderContent(); return; }
  const actionNode = event.target.closest('[data-action]');
  if (actionNode) {
    const action = actionNode.dataset.action;
    if (action === 'new') openTask(undefined, actionNode.dataset.status || 'todo');
    if (action === 'close-dialog') $('#task-dialog').close();
    if (action === 'close-info') $('#info-dialog').close();
    if (action === 'home') { event.preventDefault(); state.page = 'board'; state.project = 'all'; renderContent(); }
    if (action === 'menu') { $('.sidebar').classList.toggle('open'); $('.sidebar-backdrop').classList.toggle('open'); }
    if (action === 'reset-filters') { state.query = ''; state.project = 'all'; state.priority = 'all'; state.assignee = 'all'; $('#search').value = ''; renderContent(); }
    if (action === 'theme') {
      state.theme = state.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = state.theme;
      actionNode.innerHTML = icon(state.theme === 'dark' ? 'sun' : 'moon');
      try { localStorage.setItem('flowboard.theme', state.theme); } catch { toast('主题已切换，本次设置无法永久保存。'); }
    }
    if (action === 'export') {
      const blob = new Blob([JSON.stringify({ app: 'FlowBoard', version: 1, exportedAt: new Date().toISOString(), tasks: state.tasks }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `flowboard-${localDate()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('已导出全部任务，请保存备份文件。');
    }
    if (action === 'import') $('#import-file').click();
    if (action === 'undo' && undoAction) { const undo = undoAction; undoAction = undefined; $('#toast').classList.remove('visible'); try { await undo(); toast('已撤销操作'); } catch (error) { toast(error.message); } }
    if (action === 'help') info('简单一点，开始就好。', '<h3>管理你的任务</h3><p>点击「新建任务」添加工作；点击任意卡片可以修改描述、负责人、日期和状态。桌面端可直接拖动卡片到另一列，手机端可在编辑窗口切换状态。</p><h3>找到重点</h3><p>顶部搜索支持标题、描述、标签和编号。使用项目、优先级或成员筛选，或打开「我的任务」查看 Habby 的工作。「项目概览」会随任务数据实时变化。</p><h3>数据与运行方式</h3><p>在线演示把任务保存在当前浏览器，刷新仍会保留；本地运行 <code>npm start</code> 则使用 SQLite。成员为演示角色，当前版本为单机工作空间，未接入多人登录与实时协作。</p><h3>快捷操作</h3><p><kbd>⌘ / Ctrl + K</kbd> 搜索任务，<kbd>N</kbd> 新建任务，<kbd>Esc</kbd> 关闭弹窗。导入会按任务编号合并，重复编号以导入内容为准；导出包含全部任务。</p>');
    if (action === 'activity') info('最近动态', state.activity.length ? state.activity.slice(0, 12).map(a => `<div class="activity-row">${escape(a.message)}<small>${new Date(a.time).toLocaleString('zh-CN')}</small></div>`).join('') : '<p>还没有操作记录。新建、修改或移动任务后，动态会出现在这里。</p>');
    return;
  }
  const cardNode = event.target.closest('[data-task]');
  if (cardNode) openTask(cardNode.dataset.task);
});

$('#task-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!event.target.reportValidity()) return;
  const fields = Object.fromEntries(new FormData(event.target));
  const existing = state.tasks.find(t => t.id === fields.id);
  const task = { ...fields, id: existing?.id || `FB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, createdAt: existing?.createdAt || new Date().toISOString() };
  $('#save-task').disabled = true;
  try {
    await persist(existing ? state.tasks.map(t => t.id === task.id ? task : t) : [...state.tasks, task], `${existing ? '更新' : '创建'}了任务「${task.title}」`);
    $('#task-dialog').close(); toast(existing ? '任务已更新' : '新的想法，已加入看板');
  } catch (error) { $('#form-error').textContent = error.message; }
  finally { $('#save-task').disabled = false; }
});

$('#delete-task').addEventListener('click', async () => {
  if (!deleteArmed) { deleteArmed = true; $('#delete-task').textContent = '再次点击确认删除'; return; }
  const id = $('#task-form').elements.namedItem('id').value;
  const removed = state.tasks.find(t => t.id === id);
  $('#delete-task').disabled = true;
  try {
    await persist(state.tasks.filter(t => t.id !== id), `删除了任务「${removed.title}」`);
    $('#task-dialog').close();
    toast('任务已删除', async () => { if (state.tasks.some(t => t.id === removed.id)) throw new Error('该任务编号已经存在，无法重复恢复。'); await persist([...state.tasks, removed], `恢复了任务「${removed.title}」`); });
  } catch (error) { $('#form-error').textContent = error.message; }
  finally { $('#delete-task').disabled = false; }
});

document.addEventListener('input', event => {
  if (event.target.id === 'search') { state.query = event.target.value; if (state.page === 'overview') state.page = 'board'; renderContent(); }
});

document.addEventListener('change', async event => {
  const filters = { 'project-filter': 'project', 'priority-filter': 'priority', 'assignee-filter': 'assignee' };
  if (filters[event.target.id]) { state[filters[event.target.id]] = event.target.value; renderContent(); }
  if (event.target.id === 'import-file') {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('请选择小于 2 MB 的 JSON 文件。');
      const data = JSON.parse(await file.text()); const imported = validateTasks(Array.isArray(data) ? data : data.tasks);
      const merged = new Map(state.tasks.map(t => [t.id, t])); imported.forEach(t => merged.set(t.id, t));
      const before = [...state.tasks]; const after = [...merged.values()];
      await persist(after, `导入了 ${imported.length} 项任务`);
      const importedSnapshot = JSON.stringify(state.tasks);
      toast(`已合并导入 ${imported.length} 项任务`, () => { if (JSON.stringify(state.tasks) !== importedSnapshot) throw new Error('导入后已有新的更改，为保留这些更改，不能整批撤销。'); return persist(before, '撤销了任务导入'); });
    } catch (error) { toast(error instanceof SyntaxError ? '文件不是有效的 JSON，未修改现有任务。' : error.message); }
    event.target.value = '';
  }
});

document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) { event.preventDefault(); $('#search')?.focus(); return; }
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable;
  if (editing || document.querySelector('dialog[open]')) return;
  if (event.key.toLowerCase() === 'n' && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); openTask(); }
  if (['Enter', ' '].includes(event.key) && event.target.matches('[data-task]')) { event.preventDefault(); openTask(event.target.dataset.task); }
});

let draggedId;
document.addEventListener('dragstart', event => {
  const node = event.target.closest('[data-task]'); if (!node) return;
  draggedId = node.dataset.task; event.dataTransfer.setData('text/plain', draggedId); event.dataTransfer.effectAllowed = 'move'; node.classList.add('dragging');
});
document.addEventListener('dragover', event => { const column = event.target.closest('.column'); if (column && draggedId) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; column.classList.add('dragover'); } });
document.addEventListener('dragleave', event => { const column = event.target.closest('.column'); if (column && !column.contains(event.relatedTarget)) column.classList.remove('dragover'); });
document.addEventListener('dragend', () => { draggedId = undefined; document.querySelectorAll('.dragover,.dragging').forEach(n => n.classList.remove('dragover', 'dragging')); });
document.addEventListener('drop', async event => {
  const column = event.target.closest('.column'); if (!column || !draggedId) return;
  event.preventDefault(); const id = draggedId; draggedId = undefined;
  document.querySelectorAll('.dragover,.dragging').forEach(n => n.classList.remove('dragover', 'dragging'));
  const task = state.tasks.find(t => t.id === id); const status = column.dataset.status;
  if (!task || task.status === status) return;
  try { await persist(state.tasks.map(t => t.id === id ? { ...t, status } : t), `将「${task.title}」移至${STATUSES[status]}`); toast(`已移至${STATUSES[status]}`); } catch (error) { toast(error.message); }
});

window.addEventListener('storage', event => {
  if (!state.backend && event.key === STORAGE_KEY) {
    try { state.tasks = event.newValue === null ? seedTasks() : validateTasks(JSON.parse(event.newValue)); renderContent(); toast('已同步另一个标签页的更改'); } catch { toast('另一个标签页的数据格式异常，请导出备份后检查。'); }
  }
});

load().catch(error => {
  $('#app').innerHTML = `<div class="loading"><div><span class="brand-mark">f</span><h2>工作空间暂时无法打开</h2><p>${escape(error.message)}</p><p>本地运行请先执行 npm start；在线版请检查浏览器存储权限。</p><button class="button primary" id="retry-load">重新加载</button><button class="button" id="backup-raw">备份原始浏览器数据</button></div></div>`;
  $('#retry-load').addEventListener('click', () => location.reload());
  $('#backup-raw').addEventListener('click', () => {
    try { const raw = localStorage.getItem(STORAGE_KEY) || '[]'; const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'flowboard-recovery.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch { toast('无法读取浏览器存储。'); }
  });
});
