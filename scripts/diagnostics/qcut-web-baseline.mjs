#!/usr/bin/env node
/**
 * Per-browser baseline harness for the QCut editor's web path.
 *
 * Drives `/projects/<id>/editor` through the editor agent API
 * (`window.wzrd.editor.commands`) rather than the UI, so the run reports the
 * pipeline — import, timeline, export, download — instead of selector churn.
 *
 * For each browser it records: the bootstrap baseline snapshot
 * (`window.__wzrdQcutWebBaseline`), every failed/blocked request, console
 * errors and warnings, which export engine the factory selected, and whether a
 * downloadable artifact came out the other end.
 *
 * Usage:
 *   node scripts/diagnostics/qcut-web-baseline.mjs \
 *     --base-url http://127.0.0.1:3400 \
 *     --project-id 00000000-0000-4000-8000-000000000abc \
 *     --media-url http://127.0.0.1:3400/diagnostics/sample.mp4 \
 *     --remote-media-url http://127.0.0.1:3999/sample.mp4 \
 *     --browsers chromium,firefox,webkit \
 *     --out /tmp/qcut-web-baseline
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// Set QCUT_PLAYWRIGHT_MODULE to run against a different Playwright install —
// useful when one browser build is incompatible with the host's system libs.
const { chromium, firefox, webkit } = await import(
  process.env.QCUT_PLAYWRIGHT_MODULE ?? "playwright"
);

const BROWSERS = { chromium, firefox, webkit };

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const baseUrl = arg("base-url", "http://127.0.0.1:3400").replace(/\/$/, "");
const projectId = arg("project-id", "00000000-0000-4000-8000-000000000abc");
const mediaUrl = arg("media-url", `${baseUrl}/diagnostics/sample.mp4`);
const remoteMediaUrl = arg("remote-media-url", "");
const outDir = arg("out", "/tmp/qcut-web-baseline");
const browserNames = arg("browsers", "chromium,firefox,webkit").split(",");
const exportTimeoutMs = Number(arg("export-timeout", "120000"));

mkdirSync(outDir, { recursive: true });

const editorUrl = `${baseUrl}/projects/${projectId}/editor`;

async function runCommand(page, command, args = {}) {
  return page.evaluate(
    ([cmd, cmdArgs]) => window.wzrd?.editor?.commands?.execute(cmd, cmdArgs),
    [command, args],
  );
}

/**
 * Load a cross-origin media URL the way the editor does and report what the
 * current COEP/CORS posture allows: a no-CORS element load, an anonymous one, a
 * fetch, and whether drawing the result taints the export canvas.
 */
async function probeCrossOrigin(page, url) {
  return page.evaluate(async (remoteUrl) => {
    const result = {
      url: remoteUrl,
      elementLoad: null,
      anonymousElementLoad: null,
      fetch: null,
      canvasTainted: null,
    };

    const loadVideo = (crossOrigin) =>
      new Promise((resolve) => {
        const video = document.createElement("video");
        if (crossOrigin) video.crossOrigin = crossOrigin;
        video.muted = true;
        video.preload = "auto";
        let settled = false;
        const done = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        video.onloadeddata = () => done({ ok: true, video });
        video.onerror = () =>
          done({ ok: false, error: video.error?.message ?? "load error" });
        setTimeout(() => done({ ok: false, error: "timeout" }), 15_000);
        video.src = remoteUrl;
      });

    const plain = await loadVideo(null);
    result.elementLoad = { ok: plain.ok, error: plain.error ?? null };

    const anonymous = await loadVideo("anonymous");
    result.anonymousElementLoad = {
      ok: anonymous.ok,
      error: anonymous.error ?? null,
    };

    try {
      const response = await fetch(remoteUrl);
      result.fetch = { ok: response.ok, status: response.status };
    } catch (error) {
      result.fetch = { ok: false, error: String(error) };
    }

    const source = plain.ok
      ? plain.video
      : anonymous.ok
        ? anonymous.video
        : null;
    if (source) {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(source, 0, 0, 64, 64);
        ctx.getImageData(0, 0, 1, 1);
        result.canvasTainted = false;
      } catch (error) {
        result.canvasTainted = true;
        result.canvasError = String(error);
      }
    }

    return result;
  }, url);
}

async function runBrowser(name) {
  const launcher = BROWSERS[name];
  if (!launcher) throw new Error(`Unknown browser: ${name}`);

  const report = {
    browser: name,
    editorUrl,
    mounted: false,
    baseline: null,
    consoleErrors: [],
    consoleWarnings: [],
    failedRequests: [],
    httpErrors: [],
    engineSelection: [],
    steps: {},
    exportArtifact: null,
  };

  const browser = await launcher.launch();
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error") report.consoleErrors.push(text);
    if (message.type() === "warning") report.consoleWarnings.push(text);
    if (text.includes("EXPORT ENGINE SELECTION"))
      report.engineSelection.push(text);
  });
  page.on("pageerror", (error) =>
    report.consoleErrors.push(`[pageerror] ${error.message}`),
  );
  page.on("requestfailed", (request) =>
    report.failedRequests.push({
      url: request.url(),
      failure: request.failure()?.errorText ?? "unknown",
    }),
  );
  page.on("response", (response) => {
    if (response.status() >= 400) {
      report.httpErrors.push({
        url: response.url(),
        status: response.status(),
      });
    }
  });

  try {
    await page.goto(editorUrl, { waitUntil: "load", timeout: 180_000 });
    await page.waitForFunction(
      () => typeof window.wzrd?.editor?.commands?.execute === "function",
      null,
      { timeout: 180_000 },
    );
    report.mounted = true;

    await page.waitForFunction(() => !!window.__wzrdQcutWebBaseline, null, {
      timeout: 120_000,
    });
    report.baseline = await page.evaluate(() => window.__wzrdQcutWebBaseline);

    // Editing commands are rejected until a QCut project is active. Poll for
    // the project itself: `getProjectState` succeeds with `project: null`.
    report.steps.projectState = await page
      .waitForFunction(
        async () =>
          (await window.wzrd.editor.commands.execute("getProjectState"))?.result
            ?.project?.id
            ? true
            : false,
        null,
        { timeout: 90_000, polling: 2_000 },
      )
      .then(() => runCommand(page, "getProjectState"))
      .catch((error) => ({ ok: false, error: String(error).slice(0, 200) }));

    report.steps.importSameOrigin = await runCommand(page, "importMediaByUrl", {
      url: mediaUrl,
      name: "diagnostic-sample.mp4",
      mediaType: "video",
      durationSeconds: 3,
    });

    if (remoteMediaUrl) {
      report.steps.importCrossOrigin = await runCommand(
        page,
        "importMediaByUrl",
        {
          url: remoteMediaUrl,
          name: "diagnostic-remote.mp4",
          mediaType: "video",
          durationSeconds: 3,
        },
      );
    }

    if (remoteMediaUrl) {
      report.steps.crossOriginProbe = await probeCrossOrigin(
        page,
        remoteMediaUrl,
      );
    }

    const mediaId = report.steps.importSameOrigin?.result?.id;
    if (mediaId) {
      report.steps.addClip = await runCommand(page, "addClip", {
        mediaId,
        startTime: 0,
        duration: 3,
      });
    }

    report.steps.addText = await runCommand(page, "addText", {
      content: "WZRD baseline",
      startTime: 0,
      duration: 3,
    });

    const downloadPromise = page
      .waitForEvent("download", { timeout: exportTimeoutMs })
      .catch(() => null);
    report.steps.export = await runCommand(page, "export", {
      preset: "1080p",
      format: "mp4",
      filename: `baseline-${name}.mp4`,
    });

    const download = await downloadPromise;
    if (download) {
      const path = join(outDir, `${name}-${download.suggestedFilename()}`);
      await download.saveAs(path);
      const { size } = await import("node:fs").then((fs) => fs.statSync(path));
      report.exportArtifact = { path, bytes: size };
    }

    report.steps.exportStatus = await runCommand(page, "getExportStatus");
    report.baselineAfterRun = await page.evaluate(
      () => window.__wzrdQcutWebBaseline,
    );
    report.gracefulStubCalls = await page.evaluate(
      () => window.__wzrdQcutGracefulStubCalls ?? [],
    );

    await page.screenshot({
      path: join(outDir, `${name}.png`),
      fullPage: false,
    });
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    await page
      .screenshot({ path: join(outDir, `${name}-error.png`) })
      .catch(() => {});
  } finally {
    await browser.close();
  }

  writeFileSync(
    join(outDir, `${name}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

const summary = [];
for (const name of browserNames) {
  console.log(`\n=== ${name} ===`);
  const report = await runBrowser(name.trim());
  summary.push({
    browser: report.browser,
    mounted: report.mounted,
    crossOriginIsolated: report.baseline?.crossOriginIsolated,
    webCodecsProbe: report.baseline?.webCodecsProbe,
    engine: report.engineSelection.at(-1) ?? null,
    exportBytes: report.exportArtifact?.bytes ?? 0,
    failedRequests: report.failedRequests.length,
    consoleErrors: report.consoleErrors.length,
    error: report.error ?? null,
  });
  console.log(JSON.stringify(summary.at(-1), null, 2));
}

writeFileSync(
  join(outDir, "summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
console.log(`\nReports written to ${outDir}`);
