import { test, expect } from '@playwright/test';

const projectSetupSkeletonSelector = '[data-testid="project-setup-skeleton"]';

const perfProjectId = 'perf-project';

const mockStream =
  `event: shot\ndata: {"id":"shot-1","status":"creating","scene_id":"scene-virtual","shot_number":1}\n\n` +
  'event: done\ndata: {"completed":true}\n\n';

test.beforeEach(async ({ page }) => {
  // Mock the edge function used by `useShotStream`.
  await page.route('**/gen-shots', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      body: mockStream,
    });
  });

  // Keep project/scene fetches deterministic + fast.
  const project = {
    id: perfProjectId,
    title: 'Perf Project',
    description: 'Deterministic performance test project',
    video_style: 'cinematic',
    aspect_ratio: '16:9',
  };

  const scene = {
    id: 'perf-scene',
    project_id: perfProjectId,
    scene_number: 1,
    title: 'Perf Scene',
    description: 'Deterministic performance test scene',
    location: 'Local',
    lighting: 'soft',
    weather: 'clear',
  };

  const settings = {
    id: 'perf-settings',
    project_id: perfProjectId,
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
});

test('project setup shell appears under 4000ms', async ({ page }) => {
  const start = Date.now();
  await page.goto('/project-setup');

  // Depending on caching/hot reload, the Suspense fallback may render too quickly to observe.
  // Treat either the fallback OR the wizard header as success.
  await Promise.race([
    page.waitForSelector(projectSetupSkeletonSelector, { timeout: 4000 }),
    page.getByText('Set up your project', { exact: true }).waitFor({ timeout: 4000 }),
  ]);

  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThanOrEqual(4000);
});

test('shot auto-generate begins under 4000ms', async ({ page }) => {
  await page.goto(`/projects/${perfProjectId}/timeline`);

  const streamButton = page.getByRole('button', { name: /auto-generate/i }).first();
  await expect(streamButton).toBeVisible({ timeout: 15000 });

  const clickStart = Date.now();
  await streamButton.click();

  // The UI should surface the action immediately (toast is fired synchronously with the click handler).
  await expect(page.getByText('Generating shots').first()).toBeVisible({ timeout: 4000 });

  const elapsed = Date.now() - clickStart;
  expect(elapsed).toBeLessThanOrEqual(4000);
});
test('tab transitions respond under 200ms', async ({ page }) => {
  await page.goto('/project-setup');
  const settingsTab = page.getByRole('button', { name: /settings/i });
  await expect(settingsTab).toBeVisible();
  const interactionDuration = await settingsTab.evaluate(async (button) => {
    const start = performance.now();
    (button as HTMLButtonElement).click();
    await new Promise(requestAnimationFrame);
    return performance.now() - start;
  });
  expect(interactionDuration).toBeLessThanOrEqual(200);
});
