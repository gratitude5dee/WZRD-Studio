import { expect, test, type Page } from "@playwright/test";

const creatorRoles = [
  ["Signal Keeper", "AIR", "Listening"],
  ["Cut Director", "STUDIO", "Composing"],
  ["Worldbuilder", "EARTH", "Gathering"],
  ["Runtime Steward", "ZAP", "Routing"],
] as const;

const suppliedEffects = [
  "light-rays",
  "dither",
  "liquid-chrome",
  "grid-motion",
  "grid-distortion",
  "prism",
  "infinite-menu",
  "profile-card",
  "bounce-cards",
  "faulty-terminal",
  "card-swap",
  "pixel-card",
  "prismatic-burst",
] as const;

function installConsoleGuards(page: Page) {
  const failures: string[] = [];

  page.on("console", (message) => {
    const text = message.text();
    if (/PlatformUnsupportedError|THREE\.Clock/i.test(text)) {
      failures.push(`console ${message.type()}: ${text}`);
    }
  });

  page.on("pageerror", (error) => {
    const text = error.stack || error.message;
    if (/PlatformUnsupportedError|THREE\.Clock/i.test(text)) {
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

test("hydrates the Creator OS landing shell", async ({ page }) => {
  const assertNoPlatformUnsupported = installConsoleGuards(page);

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);

  await expect(page.locator("h1")).toHaveText("WZRD.tech");
  await expect(page.getByRole("navigation", { name: "Creator OS chapters" })).toBeVisible();
  await expect(page.getByRole("link", { name: /begin at the source/i })).toBeVisible();
  await expect(page.locator("#coming-soon")).toBeVisible();
  expect(await page.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);

  assertNoPlatformUnsupported();
});

test("honors reduced motion without mounting the WebGL scene", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("button", { name: /motion reduced/i })).toBeDisabled();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(page.locator("[data-creator-profile-card][data-motion=\"static\"]")).toHaveCount(4);
  await expect(page.locator("[data-prismatic-burst][data-motion=\"static\"]")).toHaveCount(1);
});

test("renders the complete accessible Creator constellation and motion language", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const earth = page.locator("#earth");
  await expect(earth.getByText("Conceptual roles — not member profiles.", { exact: true })).toBeVisible();
  await expect(earth.locator("[data-creator-profile-card]")).toHaveCount(4);

  for (const [role, chapter, state] of creatorRoles) {
    const card = earth.getByRole("article", { name: role });
    await expect(card.getByRole("heading", { name: role })).toBeVisible();
    await expect(card.getByText(chapter, { exact: true })).toBeVisible();
    await expect(card.getByText(state, { exact: true })).toBeVisible();
    await expect(card.locator("p")).toHaveCount(3);
  }

  for (const effect of suppliedEffects) {
    await expect(page.locator(`[data-react-bits-effect~="${effect}"]`).first()).toBeAttached();
  }
});

test("turning motion off leaves visual layers and Creator cards static", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const motionToggle = page.getByRole("button", { name: /motion on/i });
  await expect(motionToggle).toHaveAttribute("aria-pressed", "true");
  await motionToggle.click();

  await expect(page.getByRole("button", { name: /motion off/i })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-creator-profile-card][data-motion=\"static\"]")).toHaveCount(4);
  await expect(page.locator("[data-motion-layer][data-motion=\"static\"]")).toHaveCount(7);
  await expect(page.locator("[data-prismatic-burst][data-motion=\"static\"]")).toHaveCount(1);
  await expect(page.locator("[data-prismatic-burst] canvas")).toHaveCount(0);
});

test("keeps the constellation and static fallback inside a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const earth = page.locator("#earth");
  await expect(earth.locator("[data-creator-profile-card]")).toHaveCount(4);
  await expect(earth.locator("[data-creator-profile-card][data-motion=\"static\"]")).toHaveCount(4);
  await expect(page.locator("[data-prismatic-burst][data-motion=\"static\"]")).toHaveCount(1);
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
