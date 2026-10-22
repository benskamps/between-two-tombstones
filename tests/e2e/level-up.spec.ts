import { expect, test } from "@playwright/test";
import { OAKLAND_HAUNT, SLEEPY_HOLLOW_HAUNT, seedHaunt } from "./fixtures/haunt";

function seenEtiquette() {
  try {
    localStorage.setItem("btt-etiquette-seen", "1");
  } catch {
    // ignore
  }
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(seenEtiquette);
});

test.describe("Spooky & Experience Level-Up (L2.9, L4.5, L5.3)", () => {
  test("StoryCard surfaces 'Their world' lifetime milestones and marks century-gone stones", async ({ page }) => {
    await page.goto("/cemetery/Q360779");
    await expect(page.getByRole("heading", { level: 1, name: "Sleepy Hollow Cemetery" })).toBeVisible({ timeout: 25_000 });
    const cards = page.getByTestId("story-card");
    await expect(cards).toHaveCount(12, { timeout: 25_000 });

    const theirWorldItems = page.getByTestId("their-world");
    expect(await theirWorldItems.count()).toBeGreaterThan(0);
    await expect(theirWorldItems.first()).toContainText(/^Their world:/);

    const centuryCards = page.locator('[data-testid="story-card"][data-style="carved"][data-century="true"]');
    expect(await centuryCards.count()).toBeGreaterThan(0);

    const plainCentury = page.locator('[data-testid="story-card"][data-style="plain"][data-century="true"]');
    await expect(plainCentury).toHaveCount(0);
  });

  test("Stone Math (/games/stonemath) decodes 19th-century carved ages and exact lifespans", async ({ page, context }) => {
    await seedHaunt(context, OAKLAND_HAUNT);
    await page.goto("/games/stonemath");
    await expect(page.getByRole("heading", { level: 1, name: "Stone Math" })).toBeVisible();
    await expect(page.getByTestId("stonemath-result")).toHaveText("December 21, 1816");

    await page.getByRole("button", { name: "Washington Irving" }).click();
    await expect(page.getByTestId("stonemath-result")).toHaveText("76 years, 7 months, 25 days");

    await page.getByRole("button", { name: "“In the 76th year”" }).click();
    await expect(page.getByTestId("stonemath-result")).toHaveText("November 28, 1784");
  });

  test("Who Am I? (/games/whoami) presents three redacted clues from the haunt and scores guesses", async ({ page, context }) => {
    await seedHaunt(context, OAKLAND_HAUNT);
    await page.goto("/games/whoami");
    await expect(page.getByRole("heading", { level: 1, name: "Who Am I?" })).toBeVisible();
    await expect(page.getByTestId("whoami-clue-1")).toBeVisible();
    await expect(page.getByTestId("whoami-clue-2")).toHaveCount(0);

    await page.getByRole("button", { name: "Reveal clue 2 of 3" }).click();
    await expect(page.getByTestId("whoami-clue-2")).toBeVisible();

    await page.getByRole("button", { name: "Reveal clue 3 of 3" }).click();
    await expect(page.getByTestId("whoami-clue-3")).toBeVisible();

    const options = page.getByTestId("whoami-option");
    await expect(options).toHaveCount(4);
    await options.first().click();

    await expect(page.getByTestId("whoami-verdict")).toBeVisible();
    await page.getByRole("button", { name: "Next riddle" }).click();
    await expect(page.getByTestId("whoami-verdict")).toHaveCount(0);
  });

  test("Graveyard Passport (/p) tracks visited haunts, oldest stone and earned badges on the phone", async ({ page, context }) => {
    await seedHaunt(context, SLEEPY_HOLLOW_HAUNT);
    await page.goto("/cemetery/Q360779");
    await expect(page.getByTestId("haunt-toolkit").getByRole("link", { name: "Passport", exact: true })).toBeVisible({ timeout: 25_000 });

    await page.getByTestId("haunt-toolkit").getByRole("link", { name: "Passport", exact: true }).click();
    await expect(page).toHaveURL(/\/p$/);
    await expect(page.getByRole("heading", { level: 1, name: "Graveyard Passport" })).toBeVisible();

    await expect(page.getByTestId("badge-first-haunt")).toHaveAttribute("data-earned", "true");
    await expect(page.getByTestId("badge-oldest-stone")).toHaveAttribute("data-earned", "true");
    await expect(page.getByTestId("badge-century-gone")).toHaveAttribute("data-earned", "true");
    await expect(page.getByTestId("badge-civil-war")).toHaveAttribute("data-earned", "true");
    await expect(page.getByTestId("passport-cemeteries")).toContainText("Sleepy Hollow Cemetery");
  });
});
