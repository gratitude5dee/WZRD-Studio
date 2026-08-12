import { expect, test } from "@playwright/test";

const iconSpecs = [
  { path: "/brand/wzrd-icon-16.png", size: 16 },
  { path: "/brand/wzrd-icon-32.png", size: 32 },
  { path: "/brand/wzrd-icon-48.png", size: 48 },
  { path: "/brand/wzrd-icon-180.png", size: 180 },
  { path: "/brand/wzrd-icon-192.png", size: 192 },
  { path: "/brand/wzrd-icon-512.png", size: 512 },
  { path: "/brand/wzrd-icon-maskable-512.png", size: 512 },
] as const;

const mobileViewports = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
] as const;

function pngDimensions(bytes: Buffer) {
  expect(bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))).toBe(true);
  return { height: bytes.readUInt32BE(20), width: bytes.readUInt32BE(16) };
}

test("publishes complete WZRD install metadata for the native landing", async ({ page, request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);

  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    display: "standalone",
    id: "/",
    scope: "/",
    short_name: "WZRD",
    start_url: "/",
  });

  for (const { path, size } of iconSpecs) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
    expect(pngDimensions(await response.body())).toEqual({ height: size, width: size });
  }

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/brand/wzrd-icon-180.png");
});

for (const viewport of mobileViewports) {
  test(`keeps the native landing and persistent Studio CTA visible at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Build the world around the record." })).toBeVisible();
    await expect(page.locator("header").getByRole("link", { name: "Enter Studio" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    expect(await page.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("exposes motion in the touch drawer and persists the session choice", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const menu = page.getByRole("button", { name: "Open navigation" });
  await menu.click();
  const drawer = page.getByRole("dialog", { name: "WZRD Creator OS" });
  const motion = drawer.getByRole("button", { name: "Motion on" });
  await expect(motion).toHaveAttribute("aria-pressed", "true");
  await motion.click();
  await expect(motion).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "domcontentloaded" });
  await menu.click();
  await expect(drawer.getByRole("button", { name: "Motion off" })).toHaveAttribute("aria-pressed", "false");
  expect(await page.locator("canvas:visible").count()).toBe(0);
});

test("keeps the stacked product tour swipeable with visible controls", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const panel = page.getByRole("tabpanel");
  await expect(panel).toContainText("Anchor the world before you generate.");
  await expect(page.getByRole("button", { name: "Previous product tour step" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next product tour step" })).toBeVisible();

  await panel.dispatchEvent("touchstart", { changedTouches: [{ clientX: 280 }] });
  await panel.dispatchEvent("touchend", { changedTouches: [{ clientX: 120 }] });
  await expect(panel).toContainText("Branch the treatment without losing the idea.");
});

test("keeps the intro film opt-in and never blocks the hero", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: "Build the world around the record." })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  await page.getByText("Watch the WZRD intro film").click();
  const film = page.locator("video");
  await expect(film).toHaveCount(1);
  await expect(film).toHaveAttribute("preload", "metadata");
  expect(await film.evaluate((video: HTMLVideoElement) => video.autoplay)).toBe(false);
  await expect(page.locator("details")).toHaveAttribute("open", "");
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("keeps all native content visible while effects stay off", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1, name: "Build the world around the record." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "The brief stays with the work." })).toBeVisible();
    expect(await page.locator("canvas:visible").count()).toBe(0);

    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("button", { name: "Reduced motion follows your device" })).toBeDisabled();
  });
});
