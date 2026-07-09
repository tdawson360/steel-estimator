// Material sequence identifiers: bijective base-26, letters only.
// Parents A…Z, AA…; attachments take the parent seq + lowercase suffix.

// ── SEQUENCE LETTERS ─────────────────────────────────────────────────────────
// Bijective base-26, letters only (the old single-char scheme overflowed past
// Z into symbols: '[', '\', …). Parents count A…Z, AA, AB…; attachments take
// the parent seq plus a lowercase suffix (Aa, Ab, … Az, Aaa) so the 27th
// parent "AA" can never collide with parent A's first attachment "Aa".
const toAlphaSeq = (n) => {
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
};
const toChildAlphaSuffix = (n) => {
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
};
const parseAlphaSeq = (s) => {
  if (!s || !/^[A-Z]+$/.test(s)) return 0;
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
};
const parseChildAlphaSuffix = (s) => {
  if (!s || !/^[a-z]+$/.test(s)) return 0;
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 96);
  return n;
};

export { toAlphaSeq, toChildAlphaSuffix, parseAlphaSeq, parseChildAlphaSuffix };
