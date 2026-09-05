// Where drawing sets and their job outputs live on disk.
//
// DRAWINGS_DIR (env) defaults to a sibling of the repo so client drawings never
// end up in git. Layout:
//   <DRAWINGS_DIR>/<setId>/original.pdf
//   <DRAWINGS_DIR>/<setId>/markup.pdf          (estimator's Bluebeam copy)
//   <DRAWINGS_DIR>/<setId>/jobs/<jobId>/...    (sidecar outputs)
// Everything the API hands out is resolved through safeJoin so a request can
// never reach outside a set's folder.
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable, Transform } from 'stream';
import crypto from 'crypto';

export const REPO_ROOT = path.resolve(process.cwd());

export function drawingsDir() {
  return process.env.DRAWINGS_DIR || path.join(path.dirname(REPO_ROOT), 'steel-estimator-drawings');
}

export function setDir(setId) {
  return path.join(drawingsDir(), String(setId));
}

export function jobDir(setId, jobId) {
  return path.join(setDir(setId), 'jobs', String(jobId));
}

// Resolve a file name inside a set folder; refuses anything that escapes it.
export function safeJoin(base, ...parts) {
  const target = path.resolve(base, ...parts);
  const rel = path.relative(path.resolve(base), target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('path escapes the set folder');
  return target;
}

// Display name from an upload's file name: strip the extension, tidy spaces.
export function displayName(originalName) {
  return (originalName || 'drawings').replace(/\.pdf$/i, '').replace(/[_\s]+/g, ' ').trim() || 'drawings';
}

// Stream a web ReadableStream (request.body) to disk, hashing as it goes.
// Returns { bytes, sha256 }. Writes to a temp name and renames on success.
export async function streamToFile(webStream, destPath) {
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  const tmp = destPath + '.part';
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) { bytes += chunk.length; hash.update(chunk); cb(null, chunk); },
  });
  try {
    await pipeline(Readable.fromWeb(webStream), counter, fs.createWriteStream(tmp));
    await fsp.rename(tmp, destPath);
  } catch (err) {
    await fsp.rm(tmp, { force: true });
    throw err;
  }
  return { bytes, sha256: hash.digest('hex') };
}

// Cheap PDF sanity: header magic within the first KB.
export async function looksLikePdf(filePath) {
  const fh = await fsp.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(1024);
    const { bytesRead } = await fh.read(buf, 0, 1024, 0);
    return buf.subarray(0, bytesRead).includes('%PDF-');
  } finally {
    await fh.close();
  }
}

export async function listOutputs(setId, jobId) {
  const dir = jobDir(setId, jobId);
  let names = [];
  try { names = await fsp.readdir(dir); } catch { return []; }
  const out = [];
  for (const name of names) {
    const st = await fsp.stat(path.join(dir, name));
    if (st.isFile()) out.push({ name, path: path.relative(drawingsDir(), path.join(dir, name)), bytes: st.size });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
