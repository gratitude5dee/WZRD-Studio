import { expect, test, type Page } from "@playwright/test";

const enterStudioHref = "/login?next=%2Fkanvas";
const creatorOsSections = ["top", "studio", "zap", "earth", "air", "coming-soon", "enter"] as const;

// The landing renders on the server, so its controls only respond once the
// client effects have run and injected the atmosphere engine.
async function waitForLandingHydration(page: Page) {
  await expect(page.locator("script[data-creator-os-fx]")).toHaveCount(2);
}

test("paints the canonical Creator OS hero without the legacy iframe shell", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "WZRD.tech" })).toBeAttached();
  await expect(page.getByText("A creator operating system")).toBeVisible();
  await expect(page.getByText("Creative", { exact: true })).toBeVisible();
  await expect(page.getByText("Infrastructure", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "WZRD.tech home" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Make the next signal/i })).toHaveAttribute("href", enterStudioHref);
  expect(await page.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
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

test("traps and releases keyboard focus in the navigation overlay", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForLandingHydration(page);

  const hamburger = page.getByRole("button", { name: "Toggle navigation" });
  await hamburger.click();

  // Role queries skip the closed overlay (it is aria-hidden), so address the node.
  const overlay = page.locator('[role="dialog"][aria-label="Creator OS chapters"]');
  await expect(overlay).toHaveAttribute("aria-modal", "true");

  const firstBubble = overlay.getByRole("link", { name: "air", exact: true });
  await expect(firstBubble).toBeFocused();

  // Tab past the last bubble and focus wraps back to the first one.
  for (let index = 0; index < 6; index += 1) await page.keyboard.press("Tab");
  await expect(firstBubble).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(overlay).not.toHaveAttribute("aria-modal", "true");
  await expect(hamburger).toBeFocused();
});

test("switches the atmosphere off from the header motion control", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForLandingHydration(page);

  const root = page.locator("[data-fx-mode]").first();
  await expect(root).toHaveAttribute("data-fx-mode", "full");

  // The motion switch is tucked behind the hamburger until the header is
  // hovered, so reveal it through the navigation button first.
  await page.getByRole("button", { name: "Toggle navigation" }).hover();
  const motion = page.getByRole("button", { name: "Toggle motion" });
  await expect(motion).toHaveText("on");
  await motion.click();

  await expect(motion).toHaveText("off");
  await expect(root).toHaveAttribute("data-fx-mode", "off");
  await expect.poll(async () => page.locator("wz-sky").getAttribute("mode")).toBe("off");
  expect(await page.locator("canvas:visible").count()).toBe(0);
});

test("keeps the Creator OS readable and shows Earth fallback art without WebGL", async ({ page }) => {
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
  await waitForLandingHydration(page);

  await expect(page.getByRole("heading", { level: 1, name: "WZRD.tech" })).toBeAttached();
  await expect(page.getByRole("heading", { name: "Make the cut without leaving the conversation." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enter the Creative Universe." })).toBeVisible();
  await expect(page.locator("[data-fx-engine='unavailable']")).toHaveCount(1);
  await expect(page.locator("wz-infinite-menu")).toBeHidden();
});

test("uses an unpinned, complete composition for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("button", { name: "Toggle motion" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Make the cut without leaving the conversation." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zap is the recipe runtime behind every release." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enter the Creative Universe." })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Air by WZRD Tech/i })).toBeVisible();
  expect(await page.locator("canvas:visible").count()).toBe(0);
});
