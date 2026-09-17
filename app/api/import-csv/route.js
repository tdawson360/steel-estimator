import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { importTakeoffText } from '../../../lib/import-takeoff-server';

// ── TAKEOFF CSV IMPORT ────────────────────────────────────────────────────────
// The cost rules (getConnxCost, enrichOp, key normalization, field maps) live
// in lib/estimating/connection-pricing.js — the single implementation shared
// with lib/fab-pricing.js. Parsing and aggregation are in
// lib/estimating/import-takeoff.js; the database side (hardware catalog,
// pricing rows) is lib/import-takeoff-server.js, shared with the Drawings
// page's import-from-takeoff route.

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();
    const result = await importTakeoffText(text);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }
    return NextResponse.json(result);

  } catch (err) {
    console.error('import-csv error:', err);
    return NextResponse.json({ error: 'Failed to process CSV file' }, { status: 500 });
  }
}
