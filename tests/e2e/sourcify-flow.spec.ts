import { expect, test } from "@playwright/test";

const supabaseFunctionRoute = "**/functions/v1/sourcify-apify*";

test("Sourcify: normalizes YouTube duration + fetches MP4 links", async ({ page }) => {
  await page.route(supabaseFunctionRoute, async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as any;

    if (body?.action === "plan") {
      const settings = body?.settings ?? {};
      const resolvedSettings = {
        maxItems: settings.maxItems ?? 10,
        maxTotalChargeUsd: settings.maxTotalChargeUsd ?? 5,
        waitForFinishSecs: settings.waitForFinishSecs ?? 30,
        includeDownloadableOnly: settings.includeDownloadableOnly ?? false,
      };

      const plan = {
        id: "test-plan",
        topic: body.topic ?? "test",
        planner: "fallback",
        assistantMessage: "Mock plan used for E2E testing.",
        metaprompt: "",
        actors: [
          {
            id: "actor-youtube-shorts",
            key: "youtube-shorts",
            label: "YouTube Shorts",
            platform: "youtube",
            actorId: "gXSReGYeawn5nwDhI",
            confidence: 0.9,
            query: body.topic ?? "test",
            configured: true,
            reason: "E2E mock actor.",
            input: {
              startUrls: ["https://www.youtube.com/results?search_query=test+shorts"],
              includeShorts: true,
              gl: "us",
              hl: "en",
              uploadDate: "all",
              // Intentionally send an alias to ensure the client normalizes it to "s".
              duration: "short",
              features: "all",
              sort: "r",
              maxItems: resolvedSettings.maxItems,
            },
          },
        ],
        settings: resolvedSettings,
        createdAt: new Date().toISOString(),
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(plan),
      });
      return;
    }

    if (body?.action === "run") {
      if (body.actorKey === "youtube-shorts") {
        // This is the core regression check: "short" must be normalized to "s".
        expect(body.input?.duration).toBe("s");

        const response = {
          runId: "run-youtube-shorts",
          datasetId: "dataset-youtube-shorts",
          status: "SUCCEEDED",
          usageTotalUsd: 0,
          results: [
            {
              id: "result-youtube-1",
              platform: "youtube",
              actorKey: "youtube-shorts",
              category: "short",
              title: "Test Short 1",
              creator: "Test Creator",
              sourceUrl: "https://www.youtube.com/shorts/abc123",
              thumbnailUrl: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
              durationSeconds: 15,
              publishedAt: new Date().toISOString(),
              metrics: { views: 1234, likes: 55, comments: 4, shares: 1 },
              downloadable: false,
              runId: "run-youtube-shorts",
              datasetId: "dataset-youtube-shorts",
              actorId: "gXSReGYeawn5nwDhI",
              topic: body.topic,
              scrapedAt: new Date().toISOString(),
              raw: { mocked: true },
            },
          ],
        };

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(response),
        });
        return;
      }

      if (body.actorKey === "youtube-downloader") {
        const startUrls = body.input?.startUrls ?? [];
        expect(Array.isArray(startUrls)).toBeTruthy();
        expect(startUrls[0]).toContain("youtube.com/");

        const response = {
          runId: "run-youtube-downloader",
          datasetId: "dataset-youtube-downloader",
          status: "SUCCEEDED",
          usageTotalUsd: 0,
          results: [
            {
              id: "result-youtube-mp4-1",
              platform: "youtube",
              actorKey: "youtube-downloader",
              category: "short",
              title: "Test Short 1",
              creator: "Test Creator",
              sourceUrl: "https://www.youtube.com/shorts/abc123",
              mediaUrl: "https://example.com/test-short-1.mp4",
              thumbnailUrl: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
              durationSeconds: 15,
              publishedAt: new Date().toISOString(),
              metrics: { views: 1234, likes: 55, comments: 4, shares: 1 },
              downloadable: true,
              runId: "run-youtube-downloader",
              datasetId: "dataset-youtube-downloader",
              actorId: "y1IMcEPawMQPafm02",
              topic: body.topic,
              scrapedAt: new Date().toISOString(),
              raw: { mocked: true },
            },
          ],
        };

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(response),
        });
        return;
      }

      // Default mock for other actors (if any are ever added to the test).
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ runId: "run-mock", datasetId: "dataset-mock", status: "SUCCEEDED", results: [] }),
      });
      return;
    }

    if (body?.action === "finalize") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, assets: [], skipped: [] }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto("/sourcify");

  // Plan
  await page.getByLabel("Sourcify Codex prompt").fill("test shorts");
  await page.getByRole("button", { name: /plan sources/i }).click();
  await expect(page.getByRole("button", { name: "YouTube Shorts" })).toBeVisible();

  // Run
  await page.getByRole("button", { name: /run selected scrapes/i }).click();
  await expect(page.getByText("Test Short 1")).toBeVisible();

  // Select result and fetch MP4 links via bulk flow.
  await page.getByRole("checkbox", { name: "Select Test Short 1" }).click();
  const fetchMp4s = page.getByRole("button", { name: "Fetch MP4s" });
  await expect(fetchMp4s).toBeEnabled();
  await fetchMp4s.click();

  // The selection should now include a mediaUrl which enables Download MP4s.
  const downloadMp4s = page.getByRole("button", { name: "Download MP4s" });
  await expect(downloadMp4s).toBeEnabled();
});


test("Sourcify: fetches TikTok MP4 links post-hoc", async ({ page }) => {
  await page.route(supabaseFunctionRoute, async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as any;

    if (body?.action === "plan") {
      const settings = body?.settings ?? {};
      const resolvedSettings = {
        maxItems: settings.maxItems ?? 10,
        maxTotalChargeUsd: settings.maxTotalChargeUsd ?? 5,
        waitForFinishSecs: settings.waitForFinishSecs ?? 30,
        includeDownloadableOnly: settings.includeDownloadableOnly ?? false,
      };

      const plan = {
        id: "test-plan-tiktok",
        topic: body.topic ?? "test",
        planner: "fallback",
        assistantMessage: "Mock TikTok plan used for E2E testing.",
        metaprompt: "",
        actors: [
          {
            id: "actor-tiktok-fast",
            key: "tiktok-fast",
            label: "TikTok Fast",
            platform: "tiktok",
            actorId: "GdWCkxBtKWOsKjdch",
            confidence: 0.9,
            query: body.topic ?? "test",
            configured: true,
            reason: "E2E mock actor.",
            input: {
              search: ["test"],
              resultsPerPage: resolvedSettings.maxItems,
              shouldDownloadVideos: false,
            },
          },
        ],
        settings: resolvedSettings,
        createdAt: new Date().toISOString(),
      };

      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(plan) });
      return;
    }

    if (body?.action === "run") {
      if (body.actorKey === "tiktok-fast" && Array.isArray(body.input?.postURLs)) {
        // Post-hoc download run.
        expect(body.input?.shouldDownloadVideos).toBe(true);
        expect(body.input?.postURLs?.[0]).toContain("tiktok.com/");

        const response = {
          runId: "run-tiktok-downloader",
          datasetId: "dataset-tiktok-downloader",
          status: "SUCCEEDED",
          usageTotalUsd: 0,
          results: [
            {
              id: "result-tiktok-mp4-1",
              platform: "tiktok",
              actorKey: "tiktok-fast",
              category: "video",
              title: "Test TikTok 1",
              creator: "Test Creator",
              sourceUrl: "https://www.tiktok.com/@test/video/123",
              mediaUrl: "https://example.com/test-tiktok-1.mp4",
              thumbnailUrl: "https://example.com/test-tiktok-1.jpg",
              durationSeconds: 12,
              publishedAt: new Date().toISOString(),
              metrics: { views: 2222, likes: 77, comments: 5, shares: 2 },
              downloadable: true,
              runId: "run-tiktok-downloader",
              datasetId: "dataset-tiktok-downloader",
              actorId: "GdWCkxBtKWOsKjdch",
              topic: body.topic,
              scrapedAt: new Date().toISOString(),
              raw: { mocked: true },
            },
          ],
        };

        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
        return;
      }

      if (body.actorKey === "tiktok-fast") {
        // Initial scrape run.
        const response = {
          runId: "run-tiktok-fast",
          datasetId: "dataset-tiktok-fast",
          status: "SUCCEEDED",
          usageTotalUsd: 0,
          results: [
            {
              id: "result-tiktok-1",
              platform: "tiktok",
              actorKey: "tiktok-fast",
              category: "video",
              title: "Test TikTok 1",
              creator: "Test Creator",
              sourceUrl: "https://www.tiktok.com/@test/video/123",
              thumbnailUrl: "https://example.com/test-tiktok-1.jpg",
              durationSeconds: 12,
              publishedAt: new Date().toISOString(),
              metrics: { views: 2222, likes: 77, comments: 5, shares: 2 },
              downloadable: false,
              runId: "run-tiktok-fast",
              datasetId: "dataset-tiktok-fast",
              actorId: "GdWCkxBtKWOsKjdch",
              topic: body.topic,
              scrapedAt: new Date().toISOString(),
              raw: { mocked: true },
            },
          ],
        };

        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ runId: "run-mock", datasetId: "dataset-mock", status: "SUCCEEDED", results: [] }),
      });
      return;
    }

    if (body?.action === "finalize") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, assets: [], skipped: [] }) });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/sourcify");

  // Plan
  await page.getByLabel("Sourcify Codex prompt").fill("test tiktok");
  await page.getByRole("button", { name: /plan sources/i }).click();
  await expect(page.getByRole("button", { name: "TikTok Fast" })).toBeVisible();

  // Run
  await page.getByRole("button", { name: /run selected scrapes/i }).click();
  await expect(page.getByText("Test TikTok 1")).toBeVisible();

  // Select result and fetch MP4 links via bulk flow.
  await page.getByRole("checkbox", { name: "Select Test TikTok 1" }).click();
  const fetchMp4s = page.getByRole("button", { name: "Fetch MP4s" });
  await expect(fetchMp4s).toBeEnabled();
  await fetchMp4s.click();

  const downloadMp4s = page.getByRole("button", { name: "Download MP4s" });
  await expect(downloadMp4s).toBeEnabled();
});
