/**
 * Development-only timing. Prints one line per request showing where the
 * milliseconds actually went, so latency is measured rather than guessed.
 * Compiled out of production builds by the NODE_ENV check.
 */

const enabled = process.env.NODE_ENV !== "production";

export function startTimer() {
  const t0 = Date.now();
  return () => Date.now() - t0;
}

export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!enabled) return fn();

  const stop = startTimer();
  const result = await fn();
  const ms = stop();

  // Anything over ~150ms on a local dev machine is a network round trip.
  const flag = ms > 400 ? "  <-- slow" : "";
  console.log(`  [perf] ${label.padEnd(26)} ${String(ms).padStart(5)}ms${flag}`);

  return result;
}

export function perfNote(message: string) {
  if (enabled) console.log(`  [perf] ${message}`);
}
