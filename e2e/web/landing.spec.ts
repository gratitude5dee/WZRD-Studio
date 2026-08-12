import { expect, test } from "@playwright/test";

const enterStudioHref = "/login?next=%2Fkanvas";
const creatorOsSections = ["top", "studio", "zap", "earth", "air", "coming-soon", "enter"] as const;

test("paints the Creator OS hero and its static atmosphere without the legacy shell", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "WZRD.tech Creator OS" })).toBeVisible();
  await expect(page.getByText("Creative", { exact: true })).toBeVisible();
  await expect(page.getByText("Infrastructure", { exact: true })).toBeVisible();
  await expect(page.getByText("A digital and physical generative media studio to create, distribute, and monetize across all channels on one platform.")).toBeVisible();
  await expect(page.getByRole("link", { name: "WZRD.tech home" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
  await expect(page.locator("[class*='heroAtmosphere']")).toBeVisible();
  await expect(page.getByRole("link", { name: /Make the next signal/i })).toHaveAttribute("href", enterStudioHref);

  await expect(page.getByText("ALT +∞", { exact: true })).toHaveCount(0);
  await expect(page.getByText("01 / 05", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Atmosphere:|Motion is reduced/i })).toHaveCount(0);
  expect(await page.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
});

test("hands off from the hero poster to a centered device state without competing copy", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const hero = page.locator("section#top");
  const heroCopy = page.locator("[class*='heroCopy']");
  const dashboard = page.locator("[class*='heroDashboard']").filter({ has: page.locator("img[src='/creator-os/devices.png']") });
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.2));
  await expect.poll(() => heroCopy.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity))).toBeLessThan(0.05);
  await expect.poll(() => dashboard.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity))).toBeGreaterThan(0.9);
  await expect(hero).toBeVisible();
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

test("accepts the shader mode property when progressive WebGL enhancement mounts", async ({ page }) => {
  await page.addInitScript(() => {
    const webgl = {
      ARRAY_BUFFER: 0x8892,
      COMPILE_STATUS: 0x8b81,
      FLOAT: 0x1406,
      FRAGMENT_SHADER: 0x8b30,
      LINK_STATUS: 0x8b82,
      STATIC_DRAW: 0x88e4,
      TRIANGLES: 0x0004,
      VERTEX_SHADER: 0x8b31,
      attachShader() {},
      bindBuffer() {},
      bufferData() {},
      compileShader() {},
      createBuffer: () => ({}),
      createProgram: () => ({}),
      createShader: () => ({}),
      deleteShader() {},
      drawArrays() {},
      enableVertexAttribArray() {},
      getAttribLocation: () => 0,
      getExtension: () => null,
      getProgramInfoLog: () => null,
      getProgramParameter: () => true,
      getShaderInfoLog: () => null,
      getShaderParameter: () => true,
      getUniformLocation: () => ({}),
      linkProgram() {},
      shaderSource() {},
      uniform1f() {},
      uniform2f() {},
      useProgram() {},
      vertexAttribPointer() {},
      viewport() {},
    };

    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value(contextId: string) {
        return String(contextId).toLowerCase() === "webgl" ? webgl : null;
      },
      writable: true,
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("wz-sky")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "The signal needs a fresh start." })).toHaveCount(0);
});

test("falls back to the static composition when matchMedia is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: undefined,
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "WZRD.tech Creator OS" })).toBeVisible();
  await expect(page.getByText("Creative", { exact: true })).toBeVisible();
  await expect(page.locator("wz-sky")).toHaveCount(0);
});

test("uses an unpinned, complete composition for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("button", { name: /Atmosphere:|Motion is reduced/i })).toHaveCount(0);
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
