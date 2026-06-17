import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const port = process.env.DESKTOP_DEV_PORT || "8080";
const rendererUrl = `http://127.0.0.1:${port}`;
const electronBin = path.resolve(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron",
);

function waitForUrl(url, timeoutMs = 120_000) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });

      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(tick, 500);
      });
    };

    tick();
  });
}

const vite = spawn(
  "bun",
  ["run", "dev", "--", "--host", "127.0.0.1", "--port", port],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_DESKTOP: "true",
    },
  },
);

const cleanup = () => {
  if (!vite.killed) vite.kill("SIGTERM");
};

process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

await waitForUrl(rendererUrl);

const electron = spawn(electronBin, ["."], {
  stdio: "inherit",
  env: {
    ...process.env,
    ELECTRON_RENDERER_URL: rendererUrl,
  },
});

electron.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});
