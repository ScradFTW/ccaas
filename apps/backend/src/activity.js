const lastActivity = new Map();

export function touch(userId) {
  lastActivity.set(userId, Date.now());
}

export function idleMs(userId) {
  const t = lastActivity.get(userId);
  if (!t) return Infinity;
  return Date.now() - t;
}
