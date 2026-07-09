// Size-string normalization and translation to AISC database keys.
// Drives every weight lookup on import.

import { steelDatabase } from './aisc-shapes';

// Normalize steel shape size strings coming from vendor CSVs.
// Fixes UTF-8 mojibake (× encoded as Windows-1252 → "Ã—") and strips inch marks.
// Preserves industry conventions: fractions for plates (3/4), decimals for HSS (.25).
const normalizeShapeSize = (raw) => {
  if (!raw) return raw;
  let s = raw;
  // Fix mojibake: × (U+00D7) mis-decoded as Windows-1252 produces "Ã" + 0x97
  s = s.replace(/Ã[\u0097\u00d7×—]/g, 'x');
  // Replace any remaining true Unicode multiplication sign
  s = s.replace(/[×\u00d7]/g, 'x');
  // Strip inch marks (vendors don't use them, cleaner in Excel)
  s = s.replace(/"/g, '');
  return s.trim();
};

// Translate Revu size format to AISC database format
// Examples: "HSS  3 x 2 x 1/4" -> "HSS3x2x1/4", "L 4 x 4 x 1/4" -> "L4x4x1/4"
const translateSizeToAISC = (revuSize) => {
  if (!revuSize || typeof revuSize !== 'string') return { size: '', category: 'Custom', matched: false };
  
  // Normalize: trim, collapse multiple spaces, remove spaces around 'x'
  let normalized = revuSize.trim()
    .replace(/\s+/g, ' ')           // Collapse multiple spaces
    .replace(/\s*x\s*/gi, 'x')      // Remove spaces around x
    .replace(/\s*-\s*/g, '-');      // Normalize dashes
  
  // Try different patterns to match AISC format
  // Pattern 1: Direct match after normalization
  if (steelDatabase[normalized]) {
    return { size: normalized, category: steelDatabase[normalized].category, matched: true };
  }
  
  // Pattern 2: Remove all spaces
  const noSpaces = normalized.replace(/\s/g, '');
  if (steelDatabase[noSpaces]) {
    return { size: noSpaces, category: steelDatabase[noSpaces].category, matched: true };
  }
  
  // Pattern 3: Handle "HSS  3 x 2 x 1/4" -> "HSS3x2x1/4"
  const hssMatch = normalized.match(/^(HSS)\s*(.+)/i);
  if (hssMatch) {
    const hssSize = 'HSS' + hssMatch[2].replace(/\s/g, '');
    if (steelDatabase[hssSize]) {
      return { size: hssSize, category: steelDatabase[hssSize].category, matched: true };
    }

    // Pattern 3b: Handle gauge notation  "HSS8x2x11ga" -> "HSS8x2x1/8"
    const GAUGE_TO_FRACTION = {
      '3':  '1/4',
      '7':  '3/16',
      '11': '1/8',
    };
    const gaugeMatch = hssSize.match(/^(HSS[\dx]+x)(\d+)\s*ga$/i);
    if (gaugeMatch) {
      const fraction = GAUGE_TO_FRACTION[gaugeMatch[2]];
      if (fraction) {
        const converted = gaugeMatch[1] + fraction;
        if (steelDatabase[converted]) {
          return { size: converted, category: steelDatabase[converted].category, matched: true };
        }
      }
    }
  }

  // Pattern 4: Handle "L 4 x 4 x 1/4" -> "L4x4x1/4"
  const angleMatch = normalized.match(/^(L)\s*(.+)/i);
  if (angleMatch) {
    const angleSize = 'L' + angleMatch[2].replace(/\s/g, '');
    if (steelDatabase[angleSize]) {
      return { size: angleSize, category: steelDatabase[angleSize].category, matched: true };
    }
  }
  
  // Pattern 5: Handle "W 18 x 35" -> "W18x35"
  const wMatch = normalized.match(/^(W)\s*(.+)/i);
  if (wMatch) {
    const wSize = 'W' + wMatch[2].replace(/\s/g, '');
    if (steelDatabase[wSize]) {
      return { size: wSize, category: steelDatabase[wSize].category, matched: true };
    }
  }
  
  // Pattern 6: Handle "C 10 x 15.3" -> "C10x15.3"
  const cMatch = normalized.match(/^(C)\s*(.+)/i);
  if (cMatch) {
    const cSize = 'C' + cMatch[2].replace(/\s/g, '');
    if (steelDatabase[cSize]) {
      return { size: cSize, category: steelDatabase[cSize].category, matched: true };
    }
  }
  
  // Pattern 7: Handle "MC 10 x 8.4" -> "MC10x8.4"
  const mcMatch = normalized.match(/^(MC)\s*(.+)/i);
  if (mcMatch) {
    const mcSize = 'MC' + mcMatch[2].replace(/\s/g, '');
    if (steelDatabase[mcSize]) {
      return { size: mcSize, category: steelDatabase[mcSize].category, matched: true };
    }
  }
  
  // Pattern 8: Handle Pipe sizes "PIPE 4" -> "PIPE 4 STD", "PIPE 1-1/2 XS" etc.
  // Database keys keep the space ("PIPE 4 STD") and sizes can be fractional.
  const pipeMatch = normalized.match(/^PIPE\s*([\d\-/]+)\s*(STD|XS|XXS)?/i);
  if (pipeMatch) {
    const dia = pipeMatch[1];
    const grades = pipeMatch[2] ? [pipeMatch[2].toUpperCase()] : ['STD', 'XS', 'XXS'];
    for (const grade of grades) {
      const pv = `PIPE ${dia} ${grade}`;
      if (steelDatabase[pv]) {
        return { size: pv, category: 'Pipe', matched: true };
      }
    }
  }
  
  // Pattern 9: Plate "PL 3/8 x 6", "PL 1/2 x 8", "PL 0.375 x 6"
  const plateMatch = normalized.match(/^PL\s+(\S+)\s*x\s*(\S+)/i);
  if (plateMatch) {
    const thicknessStr = plateMatch[1];
    const widthStr = plateMatch[2];
    let thickness = 0;
    if (thicknessStr.includes('/')) {
      const [num, den] = thicknessStr.split('/');
      thickness = parseInt(num) / parseInt(den);
    } else {
      thickness = parseFloat(thicknessStr);
    }
    const width = parseFloat(widthStr);
    if (thickness > 0 && width > 0) {
      return { size: normalized, category: 'Plate', plateThickness: thickness, plateWidth: width, matched: true };
    }
  }

  // Pattern 10: retry with trailing annotations stripped — takeoffs sometimes
  // append grade or finish notes ("MC 12 x 10.6 (A36)", "C8x11.5 GALV",
  // "W12x26#"). Take the leading shape token and try the database again.
  const tokenMatch = normalized.match(/^([A-Za-z]{1,4}\s?[\d./x-]+)/);
  if (tokenMatch) {
    const token = tokenMatch[1].replace(/\s/g, '').replace(/[x.\-]+$/, '');
    if (token !== noSpaces && steelDatabase[token]) {
      return { size: token, category: steelDatabase[token].category, matched: true };
    }
  }

  // No match found - return as custom with original normalized value
  return { size: normalized, category: 'Custom', matched: false };
};

export { normalizeShapeSize, translateSizeToAISC };
