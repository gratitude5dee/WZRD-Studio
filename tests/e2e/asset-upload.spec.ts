import { test, expect } from "@playwright/test";

test("assets page renders the Aura Asset Store", async ({ page }) => {
  // Auth is bypassed in `bun run test:e2e` via VITE_BYPASS_AUTH_FOR_TESTS=true.
  await page.goto("/assets", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("asset-management-page")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("aura-asset-store")).toBeVisible({ timeout: 15000 });
  await expect(page.getByPlaceholder("Search uploaded references...")).toBeVisible({ timeout: 15000 });
});
