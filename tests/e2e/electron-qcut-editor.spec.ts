import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const smokeProjectId = 'route-smoke-project';

function createUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wzrd-electron-qcut-'));
}

async function launchElectronApp(params: { rendererUrl?: string } = {}) {
  const userDataDir = createUserDataDir();
  const electronApp = await electron.launch({
    args: [repoRoot],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      WZRD_DESKTOP_USER_DATA_DIR: userDataDir,
      ...(params.rendererUrl ? { ELECTRON_RENDERER_URL: params.rendererUrl } : {}),
    },
  });

  return { electronApp, userDataDir };
}

async function closeElectronApp(electronApp: Awaited<ReturnType<typeof electron.launch>>, userDataDir: string) {
  await electronApp.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForDevServer(origin: string, server: ChildProcessWithoutNullStreams, getLogs: () => string) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Vite dev server exited before ready.\n${getLogs()}`);
    }
    try {
      const response = await fetch(origin);
      if (response.status < 500) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for Vite dev server at ${origin}.\n${getLogs()}`);
}

async function startDevRenderer() {
  const port = await findAvailablePort();
  const origin = `http://127.0.0.1:${port}`;
  let logs = '';
  const appendLogs = (chunk: Buffer) => {
    logs = `${logs}${chunk.toString()}`.slice(-8_000);
  };
  const server = spawn('bun', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      VITE_BYPASS_AUTH_FOR_TESTS: 'true',
      VITE_USE_MOCK_ASSETS: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', appendLogs);
  server.stderr.on('data', appendLogs);
  await waitForDevServer(origin, server, () => logs);
  return { origin, server };
}

async function stopDevRenderer(server: ChildProcessWithoutNullStreams) {
  if (server.exitCode !== null) return;
  const exitPromise = new Promise<void>((resolve) => {
    server.once('exit', () => resolve());
  });
  server.kill('SIGTERM');
  await Promise.race([exitPromise, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (server.exitCode === null) {
    server.kill('SIGKILL');
  }
}

async function installSupabaseRouteMocks(page: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>) {
  const project = {
    id: smokeProjectId,
    title: 'Route Smoke Project',
    description: 'Electron QCut route smoke project',
    video_style: 'cinematic',
    aspect_ratio: '16:9',
  };

  await page.route('https://ixkkrousepsiorwlaycp.supabase.co/rest/v1/**', async (route, request) => {
    const url = new URL(request.url());
    const table = url.pathname.split('/').filter(Boolean).at(-1);
    const wantsObject = request.headers().accept?.includes('application/vnd.pgrst.object+json') ?? false;
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range',
      'content-range': '0-0/0',
      'content-type': 'application/json',
    };

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }

    if (request.method() === 'HEAD') {
      await route.fulfill({ status: 200, headers });
      return;
    }

    if (table === 'projects') {
      await route.fulfill({ status: 200, headers, body: JSON.stringify(wantsObject ? project : [project]) });
      return;
    }

    // Default empty lists for everything else (assets, legacy editor tables, etc.)
    await route.fulfill({ status: 200, headers, body: JSON.stringify(wantsObject ? null : []) });
  });
}

test('QCut mounts on /editor and exposes agentic command surfaces', async () => {
  const renderer = await startDevRenderer();
  const app = await launchElectronApp({ rendererUrl: renderer.origin });


  try {
    const page = await app.electronApp.firstWindow();

    await installSupabaseRouteMocks(page);

    await page.goto(`${renderer.origin}/projects/${smokeProjectId}/editor`);
    await expect(page.locator('.qcut-root')).toHaveCount(1, { timeout: 30_000 });

    // QCut bridge + editor API globals should exist.
    const globals = await page.evaluate(async () => {
      const qcut = Boolean((window as any).wzrdQcut);
      const editor = Boolean((window as any).wzrd?.editor);
      const executeType = typeof (window as any).wzrd?.editor?.commands?.execute;
      return { qcut, editor, executeType };
    });

    expect(globals).toMatchObject({ qcut: true, editor: true, executeType: 'function' });

    // MCP server info should become available.
    await page.waitForFunction(async () => {
      const info = await (window as any).wzrdQcut?.mcp?.getInfo?.();
      return Boolean(info?.url);
    }, null, { timeout: 15_000 });

    const mcpInfo = await page.evaluate(async () => {
      return await (window as any).wzrdQcut.mcp.getInfo();
    });

    expect(mcpInfo).toMatchObject({ editorConnected: true });

    // Smoke-test editor command execution.
    const state = await page.evaluate(async () => {
      return await (window as any).wzrd.editor.commands.execute('getProjectState', {});
    });

    expect(state.ok).toBe(true);
  } finally {
    await closeElectronApp(app.electronApp, app.userDataDir);
    await stopDevRenderer(renderer.server);
  }
});
