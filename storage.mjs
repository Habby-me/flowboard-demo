import { seedTasks, validateTasks } from './model.mjs';

export const STORAGE_KEY = 'flowboard.tasks.v1';
export const RECOVERY_KEY = 'flowboard.tasks.recovery.v1';

/** Keep one validated recovery snapshot; never replace unreadable primary data. */
export function loadBrowserTasks(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw !== null) return validateTasks(JSON.parse(raw));
  const tasks = seedTasks();
  storage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  return tasks;
}

export function saveBrowserTasks(storage, tasks) {
  const normalized = validateTasks(tasks);
  const previous = storage.getItem(STORAGE_KEY);
  if (previous !== null) {
    // Preserve only known-good snapshots so a failed import cannot poison recovery.
    validateTasks(JSON.parse(previous));
    storage.setItem(RECOVERY_KEY, previous);
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function recoverBrowserTasks(storage) {
  const raw = storage.getItem(RECOVERY_KEY);
  if (raw === null) throw new Error('没有可用的恢复快照。原始数据仍可导出。');
  const tasks = validateTasks(JSON.parse(raw));
  storage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  return tasks;
}
