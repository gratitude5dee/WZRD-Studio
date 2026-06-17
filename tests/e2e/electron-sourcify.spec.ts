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

function createUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wzrd-electron-sourcify-'));
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
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Vite dev server exited before ready.\n${getLogs()}`);
    }
    try {
      const response = await fetch(origin);
      if (response.status < 500) return;
    } catch {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Vite dev server at ${origin}.\n${getLogs()}`);
}

async function startDevRenderer() {
  const port = await findAvailablePort();
  const origin = `http://127.0.0.1:${port}`;
  let logs = '';
  const appendLogs = (chunk: Buffer) => {
    logs = `${logs}${chunk.toString()}`.slice(-12_000);
  };

  const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
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
  return { origin, server, getLogs: () => logs };
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

async function launchElectronApp(rendererUrl: string) {
  const userDataDir = createUserDataDir();
  const electronApp = await electron.launch({
    args: [repoRoot],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      WZRD_DESKTOP_USER_DATA_DIR: userDataDir,
      ELECTRON_RENDERER_URL: rendererUrl,
    },
  });
  return { electronApp, userDataDir };
}

async function closeElectronApp(electronApp: Awaited<ReturnType<typeof electron.launch>>, userDataDir: string) {
  await electronApp.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

const supabaseFunctionRoute = '**/functions/v1/sourcify-apify*';

test('Electron Sourcify flow: Plan → Run → Fetch MP4s enables Download MP4s', async () => {
  const { origin, server } = await startDevRenderer();
  const { electronApp, userDataDir } = await launchElectronApp(origin);

  try {
    const page = await electronApp.firstWindow();

    await page.route(supabaseFunctionRoute, async (route) => {
      const request = route.request();
      const body = request.postDataJSON() as any;

      if (body?.action === 'plan') {
        const settings = body?.settings ?? {};
        const resolvedSettings = {
          maxItems: settings.maxItems ?? 10,
          maxTotalChargeUsd: settings.maxTotalChargeUsd ?? 5,
          waitForFinishSecs: settings.waitForFinishSecs ?? 30,
          includeDownloadableOnly: settings.includeDownloadableOnly ?? false,
        };

        const plan = {
          id: 'test-plan',
          topic: body.topic ?? 'test',
          planner: 'fallback',
          assistantMessage: 'Mock plan used for Electron E2E testing.',
          metaprompt: '',
          actors: [
            {
              id: 'actor-youtube-shorts',
              key: 'youtube-shorts',
              label: 'YouTube Shorts',
              platform: 'youtube',
              actorId: 'gXSReGYeawn5nwDhI',
              confidence: 0.9,
              query: body.topic ?? 'test',
              configured: true,
              reason: 'E2E mock actor.',
              input: {
                startUrls: ['https://www.youtube.com/results?search_query=test+shorts'],
                includeShorts: true,
                gl: 'us',
                hl: 'en',
                uploadDate: 'all',
                duration: 'short',
                features: 'all',
                sort: 'r',
                maxItems: resolvedSettings.maxItems,
              },
            },
          ],
          settings: resolvedSettings,
          createdAt: new Date().toISOString(),
        };

        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(plan) });
        return;
      }

      if (body?.action === 'run') {
        if (body.actorKey === 'youtube-shorts') {
          // Critical regression check.
          expect(body.input?.duration).toBe('s');

          const response = {
            runId: 'run-youtube-shorts',
            datasetId: 'dataset-youtube-shorts',
            status: 'SUCCEEDED',
            usageTotalUsd: 0,
            results: [
              {
                id: 'result-youtube-1',
                platform: 'youtube',
                actorKey: 'youtube-shorts',
                category: 'short',
                title: 'Test Short 1',
                creator: 'Test Creator',
                sourceUrl: 'https://www.youtube.com/shorts/abc123',
                thumbnailUrl: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
                durationSeconds: 15,
                publishedAt: new Date().toISOString(),
                metrics: { views: 1234, likes: 55, comments: 4, shares: 1 },
                downloadable: false,
                runId: 'run-youtube-shorts',
                datasetId: 'dataset-youtube-shorts',
                actorId: 'gXSReGYeawn5nwDhI',
                topic: body.topic,
                scrapedAt: new Date().toISOString(),
                raw: { mocked: true },
              },
            ],
          };

          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
          return;
        }

        if (body.actorKey === 'youtube-downloader') {
          const response = {
            runId: 'run-youtube-downloader',
            datasetId: 'dataset-youtube-downloader',
            status: 'SUCCEEDED',
            usageTotalUsd: 0,
            results: [
              {
                id: 'result-youtube-mp4-1',
                platform: 'youtube',
                actorKey: 'youtube-downloader',
                category: 'short',
                title: 'Test Short 1',
                creator: 'Test Creator',
                sourceUrl: 'https://www.youtube.com/shorts/abc123',
                mediaUrl: 'https://example.com/test-short-1.mp4',
                thumbnailUrl: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
                durationSeconds: 15,
                publishedAt: new Date().toISOString(),
                metrics: { views: 1234, likes: 55, comments: 4, shares: 1 },
                downloadable: true,
                runId: 'run-youtube-downloader',
                datasetId: 'dataset-youtube-downloader',
                actorId: 'y1IMcEPawMQPafm02',
                topic: body.topic,
                scrapedAt: new Date().toISOString(),
                raw: { mocked: true },
              },
            ],
          };

          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ runId: 'run-mock', datasetId: 'dataset-mock', status: 'SUCCEEDED', results: [] }),
        });
        return;
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    // Ensure we are on Sourcify.
    await page.goto(`${origin}/sourcify`);

    const prompt = page.getByLabel('Sourcify Codex prompt');
    await expect(prompt).toBeVisible({ timeout: 60_000 });
    await prompt.fill('test shorts');
    await page.getByRole('button', { name: /plan sources/i }).click();
    await expect(page.getByRole('button', { name: 'YouTube Shorts' })).toBeVisible();

    await page.getByRole('button', { name: /run selected scrapes/i }).click();
    await expect(page.getByText('Test Short 1')).toBeVisible();

    await page.getByRole('checkbox', { name: 'Select Test Short 1' }).click();

    const fetchMp4s = page.getByRole('button', { name: 'Fetch MP4s' });
    await expect(fetchMp4s).toBeEnabled();
    await fetchMp4s.click();

    const downloadMp4s = page.getByRole('button', { name: 'Download MP4s' });
    await expect(downloadMp4s).toBeEnabled();
  } finally {
    await closeElectronApp(electronApp, userDataDir);
    await stopDevRenderer(server);
  }
});
