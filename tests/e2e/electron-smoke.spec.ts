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
const smokePngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function createUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wzrd-electron-smoke-'));
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
  await Promise.race([
    exitPromise,
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (server.exitCode === null) {
    server.kill('SIGKILL');
  }
}

async function installSupabaseRouteMocks(page: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>) {
  const project = {
    id: smokeProjectId,
    title: 'Route Smoke Project',
    description: 'Electron desktop route smoke project',
    video_style: 'cinematic',
    aspect_ratio: '16:9',
  };
  const scene = {
    id: 'route-smoke-scene',
    project_id: smokeProjectId,
    scene_number: 1,
    title: 'Opening Scene',
    description: 'A deterministic smoke-test scene',
    location: 'Desktop',
    lighting: 'soft',
    weather: 'clear',
  };
  const settings = {
    id: 'route-smoke-settings',
    project_id: smokeProjectId,
    base_text_model: 'gmi/gemini-3.1-flash-lite',
    base_image_model: 'gmi/seedream-5.0',
    base_video_model: 'gmi/kling-v3-omni',
    storyline_text_model: 'gmi/gemini-3.1-flash-lite',
    storyline_text_settings: {},
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

    if (table === 'scenes') {
      await route.fulfill({ status: 200, headers, body: JSON.stringify([scene]) });
      return;
    }

    if (table === 'characters') {
      await route.fulfill({ status: 200, headers, body: JSON.stringify([]) });
      return;
    }

    if (table === 'project_settings') {
      await route.fulfill({ status: 200, headers, body: JSON.stringify(wantsObject ? settings : [settings]) });
      return;
    }

    if (table === 'compositions') {
      await route.fulfill({ status: 200, headers, body: JSON.stringify(wantsObject ? null : []) });
      return;
    }

    await route.fulfill({ status: 200, headers, body: JSON.stringify([]) });
  });
}

async function expectDesktopBridge(page: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>) {
  const bridge = await page.evaluate(() => ({
    isDesktop: window.wzrdDesktop?.isDesktop,
    validateMediaToolchain: typeof window.wzrdDesktop?.validateMediaToolchain,
    renderTimeline: typeof window.wzrdDesktop?.renderTimeline,
    runStudioMediaAction: typeof window.wzrdDesktop?.runStudioMediaAction,
    resolveMediaFileUrl: typeof window.wzrdDesktop?.resolveMediaFileUrl,
  }));
  expect(bridge).toMatchObject({
    isDesktop: true,
    validateMediaToolchain: 'function',
    renderTimeline: 'function',
    runStudioMediaAction: 'function',
    resolveMediaFileUrl: 'function',
  });
}

async function expectNoAuthOrProjectGate(page: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>) {
  await expect(page.getByText('Authentication Required')).toHaveCount(0);
  await expect(page.getByText('Project unavailable')).toHaveCount(0);
  await expect(page.getByText('Error Loading Project')).toHaveCount(0);
}

async function renderTinyTimelineFromRoute(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>,
  params: { routeName: string; sourcePath: string; outputPath: string },
) {
  const result = await page.evaluate(async ({ routeName, sourcePath, outputPath }) => {
    if (!window.wzrdDesktop?.renderTimeline) {
      throw new Error('Desktop renderTimeline bridge is unavailable.');
    }
    return window.wzrdDesktop.renderTimeline({
      operationId: `electron-route-smoke-${routeName}`,
      outputPath,
      timeline: {
        composition: {
          width: 320,
          height: 568,
          fps: 24,
          durationMs: 1000,
          backgroundColor: '#000000',
        },
        visualTracks: [
          {
            id: `${routeName}-visual`,
            type: 'image',
            name: `${routeName} smoke frame`,
            sourcePath,
            startMs: 0,
            durationMs: 1000,
            layer: 0,
            transform: {
              position: { x: 0, y: 0 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              opacity: 1,
            },
            opacity: 1,
          },
        ],
        audioTracks: [],
        exportSettings: {
          format: 'mp4',
          quality: 'low',
          outputPath,
          includeAudio: false,
          fastStart: true,
        },
      },
    });
  }, params);

  expect(result.outputPath).toBe(params.outputPath);
  expect(fs.existsSync(params.outputPath)).toBe(true);
  expect(fs.statSync(params.outputPath).size).toBeGreaterThan(1000);

  const mediaUrl = await page.evaluate(async ({ outputPath }) => {
    if (!window.wzrdDesktop?.resolveMediaFileUrl) {
      throw new Error('Desktop media URL bridge is unavailable.');
    }
    return window.wzrdDesktop.resolveMediaFileUrl({ filePath: outputPath });
  }, params);
  expect(mediaUrl).toMatch(/^wzrd:\/\/media\//);
}

test('packaged Electron shell renders the app and keeps external navigation out of the main window', async () => {
  const { electronApp, userDataDir } = await launchElectronApp();

  try {
    const page = await electronApp.firstWindow({ timeout: 30_000 });
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toMatch(/^wzrd:\/\/app\//);
    await expect(page.locator('body')).toBeVisible();

    const bridge = await page.evaluate(() => ({
      isDesktop: window.wzrdDesktop?.isDesktop,
      platform: window.wzrdDesktop?.platform,
      openExternalType: typeof window.wzrdDesktop?.openExternal,
      deepLink: window.wzrdDesktop?.getDeepLink('/billing/success'),
    }));
    expect(bridge).toMatchObject({
      isDesktop: true,
      openExternalType: 'function',
      deepLink: 'wzrd://billing/success',
    });
    expect(typeof bridge.platform).toBe('string');

    const assetStatus = await page.evaluate(async () => {
      const response = await fetch('/lovable-uploads/wzrdtechlogo.png');
      return response.status;
    });
    expect(assetStatus).toBe(200);

    const originalUrl = page.url();
    await page.evaluate(() => {
      const anchor = document.createElement('a');
      anchor.href = 'https://example.com/';
      anchor.textContent = 'external';
      document.body.append(anchor);
      anchor.click();
    });
    await page.waitForTimeout(500);
    expect(page.url()).toBe(originalUrl);
  } finally {
    await closeElectronApp(electronApp, userDataDir);
  }
});

test('dev Electron renderer opens Clipper, Editor, Timeline, and Studio routes with the desktop media bridge', async () => {
  const { origin, server } = await startDevRenderer();
  const { electronApp, userDataDir } = await launchElectronApp({ rendererUrl: origin });
  const smokeSourcePath = path.join(userDataDir, 'route-smoke-source.png');
  const exportDir = path.join(userDataDir, 'exports');
  fs.mkdirSync(exportDir, { recursive: true });
  fs.writeFileSync(smokeSourcePath, Buffer.from(smokePngBase64, 'base64'));

  try {
    const page = await electronApp.firstWindow({ timeout: 30_000 });
    await page.waitForLoadState('domcontentloaded');
    await installSupabaseRouteMocks(page);

    await expectDesktopBridge(page);

    await page.goto(`${origin}/clipper`);
    await expect(page.getByRole('heading', { name: 'Clipper' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download & Analyze' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export included' })).toBeVisible();
    await expectNoAuthOrProjectGate(page);
    await expectDesktopBridge(page);

    await page.goto(`${origin}/projects/${smokeProjectId}/editor`);
    await expect(page.getByTestId('export-button')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.qcut-root')).toHaveCount(1, { timeout: 30_000 });
    await expectNoAuthOrProjectGate(page);
    await expectDesktopBridge(page);
    await renderTinyTimelineFromRoute(page, {
      routeName: 'editor',
      sourcePath: smokeSourcePath,
      outputPath: path.join(exportDir, 'editor-route-smoke.mp4'),
    });

    await page.goto(`${origin}/projects/${smokeProjectId}/timeline`);
    await expect(page.getByTitle('Click to edit project name')).toHaveText('Route Smoke Project');

    // `/projects/:id/timeline` is the Storyboard page. Validate key interactive affordances render.
    await expect(page.getByRole('button', { name: /auto-generate/i }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /director.*cut/i })).toBeVisible();

    await expectNoAuthOrProjectGate(page);
    await expectDesktopBridge(page);
    await renderTinyTimelineFromRoute(page, {
      routeName: 'timeline',
      sourcePath: smokeSourcePath,
      outputPath: path.join(exportDir, 'timeline-route-smoke.mp4'),
    });

    await page.goto(`${origin}/projects/${smokeProjectId}/studio`);
    await expect(page.locator('[data-walkthrough="add-button"]')).toBeVisible();
    await page.locator('[data-walkthrough="add-button"]').click();
    await expect(page.getByText('Trim Video')).toBeVisible();
    await expect(page.getByText('FFmpeg Processing').first()).toBeVisible();
    await expectNoAuthOrProjectGate(page);
    await expectDesktopBridge(page);
    await renderTinyTimelineFromRoute(page, {
      routeName: 'studio',
      sourcePath: smokeSourcePath,
      outputPath: path.join(exportDir, 'studio-route-smoke.mp4'),
    });
  } finally {
    await closeElectronApp(electronApp, userDataDir);
    await stopDevRenderer(server);
  }
});
