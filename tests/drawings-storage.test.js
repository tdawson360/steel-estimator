import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { safeJoin, displayName, streamToFile, looksLikePdf } from '../lib/drawings/storage.js';

describe('drawings storage', () => {
  it('safeJoin refuses paths that escape the set folder', () => {
    const base = path.join(os.tmpdir(), 'sets', '12');
    expect(safeJoin(base, 'original.pdf')).toBe(path.resolve(base, 'original.pdf'));
    expect(() => safeJoin(base, '..', '13', 'original.pdf')).toThrow(/escapes/);
    expect(() => safeJoin(base, '..\\..\\dev.db')).toThrow(/escapes/);
  });

  it('displayName tidies an upload file name', () => {
    expect(displayName('STRUCTURAL Pages from COMBINED - CAB IAH100-BID.pdf')).toBe('STRUCTURAL Pages from COMBINED - CAB IAH100-BID');
    expect(displayName('20260501_ 2929 Weslayan_Drawings (1).PDF')).toBe('20260501 2929 Weslayan Drawings (1)');
    expect(displayName('')).toBe('drawings');
  });

  it('streamToFile writes the stream, hashes it, and recognises a PDF header', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'drw-'));
    const dest = path.join(dir, 'a', 'original.pdf');
    const body = Buffer.from('%PDF-1.4\n%fake\n');
    const web = Readable.toWeb(Readable.from([body]));
    const { bytes, sha256 } = await streamToFile(web, dest);
    expect(bytes).toBe(body.length);
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await looksLikePdf(dest)).toBe(true);
    await fs.writeFile(dest, 'not a pdf');
    expect(await looksLikePdf(dest)).toBe(false);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
