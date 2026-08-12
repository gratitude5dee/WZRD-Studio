import { expect, test } from "@playwright/test";

const enterStudioHref = "/login?next=%2Fkanvas";
const creatorOsSections = ["top", "studio", "zap", "earth", "air", "coming-soon", "enter"] as const;

test("paints the Creator OS hero and its static atmosphere without the legacy shell", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "WZRD.tech Creator OS" })).toBeVisible();
  await expect(page.getByText("Creative", { exact: true })).toBeVisible();
  await expect(page.getByText("Infrastructure", { exact: true })).toBeVisible();
  await expect(page.getByText("Building digital and physical generative media studio to create, distribute, and monetize across all channels on one platform.")).toBeVisible();
  await expect(page.getByRole("link", { name: "WZRD.tech home" })).toBeVisible();
  await expect(page.locator("[class*='heroAtmosphere']")).toBeVisible();
  await expect(page.getByRole("link", { name: /Make the next signal/i })).toHaveAttribute("href", enterStudioHref);

  expect(await page.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
});

test("opens a keyboard-accessible Creator OS menu and preserves the Studio handoff", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const menuButton = page.getByRole("button", { name: "Open navigation" });
  await menuButton.click();
  const navigation = page.getByRole("navigation", { name: "Creator OS chapters" });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link", { name: "enter studio" })).toHaveAttribute("href", enterStudioHref);

  await page.keyboard.press("Escape");
  await expect(navigation).toBeHidden();
  await expect(menuButton).toBeFocused();
});

test("keeps the static landing intact when WebGL is unavailable", async ({ page }) => {
  await page.addInitScript(`
    (() => {
      const nativeGetContext = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
        configurable: true,
        value(contextId, ...args) {
          if (["webgl", "webgl2", "experimental-webgl"].includes(String(contextId).toLowerCase())) return null;
          return nativeGetContext.call(this, contextId, ...args);
        },
        writable: true,
      });
    })();
  `);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "WZRD.tech Creator OS" })).toBeVisible();
  await expect(page.getByText("Creative", { exact: true })).toBeVisible();
  await expect(page.locator("wz-sky")).toHaveCount(0);
  expect(await page.locator("canvas:visible").count()).toBe(0);
});

test("uses an unpinned, complete composition for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("button", { name: /Motion is reduced/i })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Make the cut without leaving the conversation." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zap is the recipe runtime behind every release." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enter the Creative Universe." })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Air by WZRD Tech/i })).toBeVisible();
  expect(await page.locator("canvas:visible").count()).toBe(0);
});

test("keeps all Creator OS chapters in source order", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const sectionIds = await page.locator("main section[id]").evaluateAll((sections) =>
    sections.map((section) => section.id),
  );
  expect(sectionIds).toEqual(creatorOsSections);
  for (const id of creatorOsSections) {
    await expect(page.locator(`section#${id}`)).toHaveCount(1);
  }
});
