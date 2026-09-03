// Soft edit lock + content version for estimates.
//
// Two estimators opening the same estimate used to overwrite each other every
// autosave (whole-tree PUT, last writer wins). Two guards now sit on top:
//
//   1. Soft lock — opening an estimate with edit rights claims it; the
//      estimator heartbeats while open and releases on close. Someone else
//      opening it sees who holds it and may take over. Advisory only: a lock
//      whose heartbeat is older than LOCK_STALE_MS is abandoned (closed
//      laptop, crashed tab) and free for anyone with edit rights.
//   2. Version check — Project.version bumps on every content write. The
//      client sends the version it loaded; the server refuses (409) when it
//      no longer matches, unless the save is explicitly forced.
//
// Shared by API routes, the estimator, and the bid board. Pure — no Prisma,
// no React.

export const LOCK_STALE_MS = 3 * 60 * 1000;   // no heartbeat this long → lock is free
export const LOCK_HEARTBEAT_MS = 60 * 1000;   // estimator pings while the tab is open

export function userDisplayName(u) {
  if (!u) return '';
  const name = `${u.firstName || ''} ${u.lastName || ''}`.trim();
  return name || u.email || (u.id != null ? `User #${u.id}` : '');
}

// True while someone holds the lock and has heartbeated within LOCK_STALE_MS.
export function isLockLive(project, now = Date.now()) {
  if (!project || project.lockedById == null) return false;
  const hb = project.lockHeartbeatAt ? new Date(project.lockHeartbeatAt).getTime() : 0;
  return Number.isFinite(hb) && now - hb < LOCK_STALE_MS;
}

// Client-facing view of a project's lock relative to the viewing user.
//   { held, mine, holder: { id, name } | null, since }
export function lockView(project, userId, now = Date.now()) {
  if (!isLockLive(project, now)) return { held: false, mine: false, holder: null, since: null };
  const mine = userId != null && Number(project.lockedById) === Number(userId);
  return {
    held: true,
    mine,
    holder: { id: project.lockedById, name: userDisplayName(project.lockedBy) },
    since: project.lockedAt ? new Date(project.lockedAt).toISOString() : null,
  };
}

// Another user holds a live lock on this project.
export function isLockedByOther(project, userId, now = Date.now()) {
  const v = lockView(project, userId, now);
  return v.held && !v.mine;
}
