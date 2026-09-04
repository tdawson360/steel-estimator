// Exports the app's AISC shape table to sidecar/aisc-shapes.json so the Python
// auto-takeoff sidecar validates callouts against exactly the sizes the
// estimator can price. Re-run after editing lib/estimating/aisc-shapes.js.
//   node scripts/export-aisc-shapes.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { steelDatabase } = await import('../lib/estimating/aisc-shapes.js');
const out = join(root, 'sidecar', 'aisc-shapes.json');
writeFileSync(out, JSON.stringify(steelDatabase));
console.log(`wrote ${Object.keys(steelDatabase).length} shapes to ${out}`);
