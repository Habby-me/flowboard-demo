export const STATUSES = { todo: '待开始', doing: '进行中', done: '已完成' };
export const PRIORITIES = { high: '高优先级', medium: '中优先级', low: '低优先级' };
export const PROJECTS = { product: '产品研发', design: '品牌设计', growth: '增长实验' };
export const MEMBERS = { H: 'Habby', L: '林可', C: '陈晨', Z: '周一' };

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function seedTasks(now = new Date()) {
  const day = (offset) => { const d = new Date(now); d.setDate(d.getDate() + offset); return localDate(d); };
  return [
    ['梳理新版本需求与用户故事', '整理用户反馈，确认 v1.0 核心场景和验收标准。', 'todo', 'high', 'product', 'H', 2, '产品规划'],
    ['搭建组件库与设计规范', '统一按钮、输入框、色彩与间距，让产品拥有一致的表达。', 'todo', 'medium', 'design', 'L', 3, '设计系统'],
    ['设计新用户引导流程', '用更清晰的三步引导，帮助新用户完成第一次操作。', 'todo', 'low', 'growth', 'Z', 5, '用户体验'],
    ['实现任务看板与拖拽交互', '支持任务跨列移动，同时保留表单中的无障碍状态切换。', 'doing', 'high', 'product', 'H', 0, '前端开发'],
    ['完成品牌视觉探索', '探索更温暖、清晰的品牌视觉语言，整理三组方向供评审。', 'doing', 'medium', 'design', 'L', 1, '视觉设计'],
    ['接入数据持久化与接口', '实现 SQLite 存储、输入校验，以及版本冲突检测。', 'doing', 'high', 'product', 'C', -1, '后端开发'],
    ['整理产品调研与竞品分析', '完成 5 个产品的体验走查，输出可执行的机会清单。', 'done', 'medium', 'product', 'Z', -2, '用户研究'],
    ['搭建项目开发环境', '完成 Node.js 工程配置、脚本和本地预览。', 'done', 'low', 'product', 'H', -3, '工程搭建'],
    ['制定第一阶段增长计划', '确定内容实验假设、观察指标和复盘节奏。', 'done', 'medium', 'growth', 'C', -1, '增长策略']
  ].map((row, i) => ({ id: `FB-${String(i + 1).padStart(3, '0')}`, title: row[0], description: row[1], status: row[2], priority: row[3], project: row[4], assignee: row[5], due: day(row[6]), tag: row[7], createdAt: new Date(now.getTime() - (10 - i) * 3600000).toISOString() }));
}

export function validateTasks(input) {
  if (!Array.isArray(input) || input.length > 500) throw new Error('任务数据必须是数组，且最多包含 500 条任务。');
  const ids = new Set();
  return input.map((task) => {
    if (!task || typeof task !== 'object' || Array.isArray(task)) throw new Error('任务格式不正确。');
    const text = (field, limit, required = false) => {
      if (typeof task[field] !== 'string' || task[field].length > limit || (required && !task[field].trim())) throw new Error(`任务字段 ${field} 不正确或超出长度限制。`);
      return task[field].trim();
    };
    const id = text('id', 80, true);
    if (!/^[\w-]+$/.test(id) || ids.has(id)) throw new Error('任务编号无效或重复。');
    ids.add(id);
    for (const [field, values] of Object.entries({ status: STATUSES, priority: PRIORITIES, project: PROJECTS, assignee: MEMBERS })) {
      if (!Object.hasOwn(values, task[field])) throw new Error(`任务字段 ${field} 的值无效。`);
    }
    const due = text('due', 10);
    if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(Date.parse(due)) || new Date(due).toISOString().slice(0, 10) !== due)) throw new Error('截止日期无效。');
    const createdAt = text('createdAt', 40, true);
    if (!Number.isFinite(Date.parse(createdAt))) throw new Error('创建日期无效。');
    return { id, title: text('title', 100, true), description: text('description', 2000), status: task.status, priority: task.priority, project: task.project, assignee: task.assignee, due, tag: text('tag', 20), createdAt };
  });
}

export function filterTasks(tasks, { query = '', project = 'all', priority = 'all', assignee = 'all' } = {}) {
  const search = query.trim().toLocaleLowerCase();
  return tasks.filter(t => (project === 'all' || t.project === project) && (priority === 'all' || t.priority === priority) && (assignee === 'all' || t.assignee === assignee) && (!search || [t.title, t.description, t.id, t.tag].some(v => v.toLocaleLowerCase().includes(search))));
}

export function summarize(tasks, today = localDate()) {
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  return { total, done, doing: tasks.filter(t => t.status === 'doing').length, overdue: tasks.filter(t => t.due && t.due < today && t.status !== 'done').length, percent: total ? Math.round(done / total * 100) : 0 };
}
