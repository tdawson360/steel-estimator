// Nightly SQLite backup for the Steel Estimator database.
//
// - Copies prisma/dev.db to a timestamped file in BACKUP_DIR using VACUUM INTO
//   (an online-consistent snapshot; read-only against the source).
// - Verifies the copy: PRAGMA integrity_check must return "ok" and the Project
//   row count must match the source exactly.
// - Mirrors the verified snapshot into MIRROR_DIR (a OneDrive-synced folder),
//   so every backup leaves the machine — a dead disk can't take the database
//   and all its backups together.
// - Prunes backups older than RETENTION_DAYS in both locations.
// - Appends one line per run to backup.log in BACKUP_DIR.
// - Exits nonzero (and logs FAIL) on any error — a mirror failure included,
//   because a silently broken mirror defeats its purpose — so Task Scheduler
//   records the run as failed.
//
// Intended to run via Windows Task Scheduler; see the schtasks registration
// command in the repo docs / commit message. Paths are derived from this
// script's own location so the scheduled task's working directory is irrelevant.

import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DB = path.resolve(SCRIPT_DIR, '..', 'prisma', 'dev.db');
const BACKUP_DIR = 'C:\\Projects\\steel-estimator-db-backups';
const MIRROR_DIR = 'C:\\Users\\tdawson\\OneDrive - Berger Iron Works\\SteelEstimator-DB-Backups';
const LOG_FILE = path.join(BACKUP_DIR, 'backup.log');
const RETENTION_DAYS = 60;

function log(line) {
  const entry = `${new Date().toISOString()} ${line}\n`;
  fs.appendFileSync(LOG_FILE, entry);
  process.stdout.write(entry);
}

// SQLite URL with forward slashes (Prisma requires them on Windows)
const toSqliteUrl = (p) => 'file:' + p.replace(/\\/g, '/');

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  if (!fs.existsSync(SOURCE_DB)) {
    throw new Error(`source database not found: ${SOURCE_DB}`);
  }

  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19); // YYYY-MM-DD-HH-mm-ss
  const backupPath = path.join(BACKUP_DIR, `dev.db.backup-${stamp}`);

  // 1. Snapshot
  const source = new PrismaClient({ datasources: { db: { url: toSqliteUrl(SOURCE_DB) } } });
  let sourceCount;
  try {
    await source.$queryRawUnsafe(`VACUUM INTO '${backupPath.replace(/\\/g, '/')}'`);
    sourceCount = await source.project.count();
  } finally {
    await source.$disconnect();
  }

  // 2. Verify the copy independently
  const backup = new PrismaClient({ datasources: { db: { url: toSqliteUrl(backupPath) } } });
  let integrity, backupCount;
  try {
    const rows = await backup.$queryRawUnsafe('PRAGMA integrity_check');
    integrity = rows?.[0]?.integrity_check;
    backupCount = await backup.project.count();
  } finally {
    await backup.$disconnect();
  }

  if (integrity !== 'ok') {
    throw new Error(`integrity_check failed on ${backupPath}: ${JSON.stringify(integrity)}`);
  }
  if (backupCount !== sourceCount) {
    throw new Error(`row count mismatch: source Project=${sourceCount}, backup Project=${backupCount} (${backupPath})`);
  }

  // 3. Mirror the verified snapshot off-machine (OneDrive syncs it to the cloud)
  fs.mkdirSync(MIRROR_DIR, { recursive: true });
  const mirrorPath = path.join(MIRROR_DIR, path.basename(backupPath));
  fs.copyFileSync(backupPath, mirrorPath);
  if (fs.statSync(mirrorPath).size !== fs.statSync(backupPath).size) {
    throw new Error(`mirror size mismatch: ${mirrorPath}`);
  }

  // 4. Prune old backups in both locations
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const pruned = [];
  for (const dir of [BACKUP_DIR, MIRROR_DIR]) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith('dev.db.backup-')) continue;
      const full = path.join(dir, name);
      if (fs.statSync(full).mtimeMs < cutoff) {
        fs.unlinkSync(full);
        pruned.push(name);
      }
    }
  }

  const size = fs.statSync(backupPath).size;
  log(`OK backup=${path.basename(backupPath)} size=${size}B projects=${backupCount} integrity=ok mirrored=${path.basename(mirrorPath)} pruned=[${pruned.join(', ')}]`);
}

main().catch((err) => {
  try {
    log(`FAIL ${err.message}`);
  } catch {
    console.error(err);
  }
  process.exit(1);
});
