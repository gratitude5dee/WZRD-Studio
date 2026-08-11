import { expect, test, type Page } from "@playwright/test";

const projectId = "e2e-browser-editor";

function installConsoleGuards(page: Page) {
  const failures: string[] = [];

  page.on("console", (message) => {
    const text = message.text();
    if (/PlatformUnsupportedError|Bundle unpack error/i.test(text)) {
      failures.push(`console ${message.type()}: ${text}`);
    }
  });

  page.on("pageerror", (error) => {
    failures.push(`pageerror: ${error.stack || error.message}`);
  });

  return () => {
    expect(failures).toEqual([]);
  };
}

test("browser editor mounts with media panel and timeline, without desktop-only surfaces", async ({
  page,
}) => {
  const assertNoRuntimeErrors = installConsoleGuards(page);

  const response = await page.goto(`/projects/${projectId}/editor`, {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByTestId("media-panel")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("timeline-toolbar")).toBeVisible({
    timeout: 30_000,
  });

  // Desktop-only tabs must be hidden in the browser, not erroring.
  await expect(page.getByTestId("pty-panel-tab")).toHaveCount(0);

  assertNoRuntimeErrors();
});
