// lib/project-lock.js — soft edit lock helpers shared by the routes, the
// estimator, and the bid board.

import { describe, it, expect } from 'vitest';
import { LOCK_STALE_MS, isLockLive, lockView, isLockedByOther, userDisplayName } from '../lib/project-lock.js';

const now = Date.parse('2026-09-03T15:00:00Z');
const lock = (over = {}) => ({
  lockedById: 6,
  lockedAt: new Date(now - 60_000),
  lockHeartbeatAt: new Date(now - 30_000),
  lockedBy: { id: 6, firstName: '', lastName: 'Neil', email: 'sneil@bergeriron.com' },
  ...over,
});

describe('project-lock', () => {
  it('a lock is live only while the heartbeat is fresh', () => {
    expect(isLockLive(lock(), now)).toBe(true);
    expect(isLockLive(lock({ lockHeartbeatAt: new Date(now - LOCK_STALE_MS) }), now)).toBe(false);
    expect(isLockLive(lock({ lockHeartbeatAt: null }), now)).toBe(false);
    expect(isLockLive({ lockedById: null, lockHeartbeatAt: new Date(now) }, now)).toBe(false);
    expect(isLockLive(null, now)).toBe(false);
  });

  it('lockView tells the viewer whether it is theirs and who holds it', () => {
    expect(lockView(lock(), 6, now)).toMatchObject({ held: true, mine: true, holder: { id: 6, name: 'Neil' } });
    expect(lockView(lock(), '1', now)).toMatchObject({ held: true, mine: false });
    expect(lockView(lock(), '6', now).mine).toBe(true);   // session ids arrive as strings
    expect(lockView(lock(), 1, now).since).toBe(new Date(now - 60_000).toISOString());
    expect(lockView(lock({ lockHeartbeatAt: new Date(now - LOCK_STALE_MS - 1) }), 1, now))
      .toEqual({ held: false, mine: false, holder: null, since: null });
  });

  it('isLockedByOther is false for the holder and for stale locks', () => {
    expect(isLockedByOther(lock(), 1, now)).toBe(true);
    expect(isLockedByOther(lock(), 6, now)).toBe(false);
    expect(isLockedByOther(lock({ lockHeartbeatAt: null }), 1, now)).toBe(false);
  });

  it('userDisplayName falls back to email, then id', () => {
    expect(userDisplayName({ firstName: 'Todd', lastName: 'Dawson' })).toBe('Todd Dawson');
    expect(userDisplayName({ firstName: '', lastName: '', email: 'x@y.z' })).toBe('x@y.z');
    expect(userDisplayName({ id: 9 })).toBe('User #9');
    expect(userDisplayName(null)).toBe('');
  });
});
