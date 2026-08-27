// Labor group row shading. FULL literal Tailwind class strings only —
// Tailwind's JIT scans source for literals, so these must never be
// template-built. Indexed by group.colorIndex % LABOR_GROUP_STYLES.length
// (keep length in sync with GROUP_COLOR_COUNT in lib/estimating/labor-groups).
export const LABOR_GROUP_STYLES = [
  {
    row: 'bg-violet-50 dark:bg-violet-950',
    tag: 'text-violet-600',
    input: 'bg-violet-50 dark:bg-violet-950',
    total: 'text-violet-700',
  },
  {
    row: 'bg-sky-50 dark:bg-sky-950',
    tag: 'text-sky-600',
    input: 'bg-sky-50 dark:bg-sky-950',
    total: 'text-sky-700',
  },
  {
    row: 'bg-rose-50 dark:bg-rose-950',
    tag: 'text-rose-600',
    input: 'bg-rose-50 dark:bg-rose-950',
    total: 'text-rose-700',
  },
  {
    row: 'bg-teal-50 dark:bg-teal-950',
    tag: 'text-teal-600',
    input: 'bg-teal-50 dark:bg-teal-950',
    total: 'text-teal-700',
  },
  {
    row: 'bg-amber-50 dark:bg-amber-950',
    tag: 'text-amber-600',
    input: 'bg-amber-50 dark:bg-amber-950',
    total: 'text-amber-700',
  },
];

export const laborGroupStyle = (colorIndex) =>
  LABOR_GROUP_STYLES[(colorIndex || 0) % LABOR_GROUP_STYLES.length];
