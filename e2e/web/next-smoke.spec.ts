import { expect, test, type Page } from "@playwright/test";

function installConsoleGuards(page: Page) {
  const failures: string[] = [];

  page.on("console", (message) => {
    const text = message.text();
    if (/PlatformUnsupportedError/i.test(text)) {
      failures.push(`console ${message.type()}: ${text}`);
    }
  });

  page.on("pageerror", (error) => {
    const text = error.stack || error.message;
    if (/PlatformUnsupportedError/i.test(text)) {
      failures.push(`pageerror: ${text}`);
    }
  });

  return () => {
    expect(failures).toEqual([]);
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("mog-intro-seen", "true");
  });
});

test("hydrates the public landing shell", async ({ page }) => {
  const assertNoPlatformUnsupported = installConsoleGuards(page);

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByRole("link", { name: /log in/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /sign up/i })).toBeVisible();

  assertNoPlatformUnsupported();
});

test("resolves login into an authenticated editor route under test auth", async ({ page }) => {
  const assertNoPlatformUnsupported = installConsoleGuards(page);

  await page.goto("/login?next=/projects/demo/editor", { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/projects/demo/editor", { timeout: 45_000 });

  await expect(page.locator(".qcut-root")).toBeVisible();

  assertNoPlatformUnsupported();
});

test("loads and reloads the isolated editor route", async ({ page }) => {
  const assertNoPlatformUnsupported = installConsoleGuards(page);

  const response = await page.goto("/projects/demo/editor", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);
  expect(response?.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  expect(response?.headers()["cross-origin-embedder-policy"]).toBe("require-corp");

  await expect(page.locator(".qcut-root")).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/projects\/demo\/editor$/);
  await expect(page.locator(".qcut-root")).toBeVisible();

  assertNoPlatformUnsupported();
});
