import { expect, test } from "@playwright/test";

const enterStudioHref = "/login?next=%2Fkanvas";

test("paints the semantic hero and permanent atmosphere without the legacy shell", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Build the world around the record." })).toBeVisible();
  await expect(page.locator("[data-static-atmosphere]")).toBeVisible();
  await expect(page.locator("wz-sky[data-hero-sky]")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Enter Studio" }).first()).toHaveAttribute("href", enterStudioHref);
  await expect(page.getByRole("link", { name: "Product tour" }).first()).toHaveAttribute("href", "#product-tour");

  await expect(page.locator("video")).toHaveCount(0);
  await page.getByText("Watch the WZRD intro film").click();
  const film = page.locator("video");
  await expect(film).toHaveCount(1);
  await expect(film).toHaveAttribute("preload", "metadata");
  expect(await film.evaluate((video: HTMLVideoElement) => video.autoplay)).toBe(false);
});

test("operates the product tour as a keyboard tablist", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const tabs = page.getByRole("tablist", { name: "Product tour steps" });
  const first = tabs.getByRole("tab").nth(0);
  const second = tabs.getByRole("tab").nth(1);
  await first.focus();
  await first.press("ArrowRight");

  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Branch the treatment without losing the idea.");

  await second.press("End");
  await expect(tabs.getByRole("tab").nth(2)).toHaveAttribute("aria-selected", "true");
});

test("shows an honest product-capture fallback when media cannot load", async ({ page }) => {
  await page.route("**/lovable-uploads/4e20f36a-2bff-48d8-b07b-257334e35506.png", route => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("status")).toContainText("Preview unavailable");
  await expect(page.getByRole("status")).toContainText("/kanvas?studio=cinema");
});

test("keeps the static atmosphere when WebGL is unavailable", async ({ page }) => {
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
  await expect(page.getByRole("heading", { level: 1, name: "Build the world around the record." })).toBeVisible();
  await expect(page.locator("[data-static-atmosphere]")).toBeVisible();
  expect(await page.locator("canvas:visible").count()).toBe(0);
});

test("uses at most one hero canvas and parks it offscreen", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const sky = page.locator("wz-sky[data-hero-sky]");
  const initial = await sky.evaluate((element) => {
    const state = element as unknown as Record<string, unknown>;
    return {
      canvasCount: element.shadowRoot?.querySelectorAll("canvas").length ?? 0,
      hasContext: Boolean(state.gl),
    };
  });
  expect(initial.canvasCount).toBeLessThanOrEqual(1);

  await page.locator("#system").scrollIntoViewIfNeeded();
  await expect.poll(() => sky.evaluate((element) => {
    const state = element as unknown as Record<string, unknown>;
    return Number(state.animationFrame ?? 0);
  })).toBe(0);

  if (initial.hasContext) {
    await expect.poll(() => sky.evaluate((element) => {
      const state = element as unknown as Record<string, unknown>;
      return Boolean(state.gl);
    }), { timeout: 8_000 }).toBe(false);
  }
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("exposes complete content with the shader and reveals disabled", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1, name: "Build the world around the record." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "The brief stays with the work." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reduced motion" })).toBeDisabled();
    expect(await page.locator("canvas:visible").count()).toBe(0);
  });
});
