// Case-insensitive `contains` filter that works on the active Prisma provider.
//
// Prisma's `mode: 'insensitive'` argument is only supported on PostgreSQL and
// MongoDB — passing it on SQLite throws PrismaClientValidationError ("Unknown
// argument `mode`"), which 500'd every search request. On SQLite we simply
// omit it: SQLite's LIKE (which backs `contains`) is already case-insensitive
// for ASCII characters, so behavior is equivalent for our data.
//
// ── POSTGRES MIGRATION CHECKLIST ITEM ────────────────────────────────────────
// When DATABASE_URL moves off `file:` this helper automatically starts sending
// `mode: 'insensitive'`, which Postgres requires for case-insensitive search
// (Postgres LIKE is case-SENSITIVE by default). Verify search behavior after
// the migration; no call-site changes should be needed.
export function caseInsensitiveContains(term) {
  const isSqlite = (process.env.DATABASE_URL || '').startsWith('file:');
  return isSqlite
    ? { contains: term }
    : { contains: term, mode: 'insensitive' };
}
