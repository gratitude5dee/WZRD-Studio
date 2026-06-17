// Minimal browser-safe `process` shim.
//
// Some dependencies (ex: @babel/* used by Remotion tooling) reference `process.env`
// and occasionally `process.cwd()` even when bundled for the browser.
//
// We provide a tiny global `process` implementation so those references don't crash.

/* eslint-disable no-var */
declare global {
  // `var` is intentional: this is a global provided at runtime.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  var process:
    | {
        env?: Record<string, string | undefined>;
        cwd?: () => string;
      }
    | undefined;
}
/* eslint-enable no-var */

const g = globalThis as unknown as { process?: any };

g.process ??= {};
g.process.env ??= {};

g.process.cwd ??= (() => "/");

export {};
