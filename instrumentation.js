// Runs once when the Next.js server starts (next.config experimental.instrumentationHook).
// The import must sit inside the NEXT_RUNTIME check so the edge bundle never
// sees Node-only modules (child_process, fs); Next replaces NEXT_RUNTIME per
// runtime and drops the other branch.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { recoverOnBoot } = await import('./lib/drawings/runner');
      await recoverOnBoot();
    } catch (err) {
      console.error('[drawings] runner did not start:', err?.message || err);
    }
  }
}
