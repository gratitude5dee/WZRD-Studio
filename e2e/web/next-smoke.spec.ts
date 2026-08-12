import { expect, test, type Page } from "@playwright/test";

const landingSectionIds = ["top", "product-tour", "music-worlds", "next", "system"] as const;

function installConsoleGuards(page: Page) {
  const failures: string[] = [];

  page.on("console", (message) => {
    const text = message.text();
    if (/PlatformUnsupportedError|THREE\.Clock|Bundle unpack error/i.test(text)) {
      failures.push(`console ${message.type()}: ${text}`);
    }
  });

  page.on("pageerror", (error) => {
    const text = error.stack || error.message;
    if (/PlatformUnsupportedError|THREE\.Clock|Bundle unpack error/i.test(text)) {
      failures.push(`pageerror: ${text}`);
    }
  });

  return () => {
    expect(failures).toEqual([]);
  };
}

test("renders the native WZRD landing in its editorial source order", async ({ page }) => {
  const assertNoPlatformUnsupported = installConsoleGuards(page);

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);

  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Build the world around the record." })).toBeVisible();
  await expect(page.getByRole("link", { name: "WZRD.tech home" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Enter Studio" }).first()).toHaveAttribute(
    "href",
    "/login?next=%2Fkanvas",
  );

  const sectionIds = await page.locator("section[id]").evaluateAll((sections) =>
    sections.map((section) => section.id),
  );
  expect(sectionIds).toEqual(landingSectionIds);

  for (const id of landingSectionIds) {
    await expect(page.locator(`section#${id}`)).toHaveCount(1);
  }

  await expect(page.getByRole("heading", { name: "From a reference to a world you can produce." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "One engine. Different visual grammar for every record." })).toBeVisible();
  expect(await page.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);

  assertNoPlatformUnsupported();
});

test("keeps the native mobile drawer focus-managed and routes Studio safely", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const menuButton = page.getByRole("button", { name: "Open navigation" });
  await menuButton.click();
  const drawer = page.getByRole("dialog", { name: "WZRD Creator OS" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Enter Studio" })).toHaveAttribute(
    "href",
    "/login?next=%2Fkanvas",
  );
  await expect(drawer.getByRole("button", { name: /motion/i })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(menuButton).toBeFocused();
});

test("retains the native landing without root overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: "Build the world around the record." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Enter Studio" }).first()).toBeVisible();
  expect(await page.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
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
