/**
 * Helpers for the result grading panel.
 *
 * The skill band is DERIVED — floorHalf of the 4 criterion bands, computable only once all four
 * are set — and rendered read-only. A test therefore sets the criteria and reads the band back;
 * it can never set the band itself.
 */

import { expect, type Page } from "@playwright/test";

/** The criterion selects sit in the grading panel's left column. */
function criterionSelects(page: Page) {
  return page.locator("main > aside").first().locator("select");
}

/**
 * Sets the criteria, which is what makes saving possible.
 *
 * One value sets them all; a list sets them one by one, which is how a caller reaches a criterion
 * average of .25/.75 — the averages where the rounding rule actually shows itself.
 */
export async function fillCriteriaBands(page: Page, bands: string | string[]): Promise<void> {
  const selects = criterionSelects(page);
  await expect(selects.first()).toBeVisible({ timeout: 10_000 });
  const count = await selects.count();
  for (let i = 0; i < count; i++) {
    await selects.nth(i).selectOption(Array.isArray(bands) ? bands[i % bands.length] : bands);
  }
}

/** Empties one criterion, which leaves the band uncomputable and blocks saving. */
export async function clearOneCriterionBand(page: Page): Promise<void> {
  await criterionSelects(page).first().selectOption("");
}

/** The derived band as displayed — "—" while any criterion is still missing. */
export async function overallBandText(page: Page): Promise<string> {
  const band = page.getByTestId("band-select-overall");
  await expect(band).toBeVisible({ timeout: 10_000 });
  return ((await band.textContent()) ?? "").trim();
}
