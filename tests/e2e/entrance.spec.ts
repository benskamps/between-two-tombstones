import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
  test(`entrance is usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Swipe right on a graveyard.");
    const artwork = page.locator(".cemetery-hero-image");
    await expect(artwork).toBeVisible();
    await expect.poll(() => artwork.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    const swipe = page.getByRole("link", { name: "Start swiping", exact: true });
    await expect(swipe).toBeInViewport();
    await expect(swipe).toHaveAttribute("href", "/gravitator");
    await expect(page.getByRole("link", { name: "Step into Sleepy Hollow", exact: true })).toBeInViewport();
    // Anyone not near a graveyard can swipe a city's deck without sharing a location.
    await expect(page.getByRole("link", { name: "Savannah", exact: true })).toHaveAttribute("href", "/gravitator?lat=32.0809&lon=-81.0912&near=Savannah%2C+GA");
    await page.screenshot({ path: `test-results/entrance-${viewport.width}.png` });
    await page.goto("/");
    await page.getByRole("link", { name: "Step into Sleepy Hollow", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sleepy Hollow Cemetery" })).toBeVisible({ timeout: 25000 });
    await expect(page.getByTestId("story-card").first()).toBeVisible({ timeout: 25000 });
  });
}
