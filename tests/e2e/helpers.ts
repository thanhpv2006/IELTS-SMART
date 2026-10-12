/**
 * Take-flow helpers. The exam engine owns this UI: the mic opens by itself (`autoRecord`), the
 * forward control ends a take, and the runner submits once every question has audio.
 *
 * Selectors are the engine's `data-tour` hooks, not its labels — labels are host-overridable copy.
 */

import { expect, type Locator, type Page } from "@playwright/test";

/** Engine forward control: ends the current take, then advances. */
const FORWARD = '[data-tour="next"]';

/** Section-wide progress, e.g. "Answered 2/5" — the per-part "Question X of Y" counter is not. */
const PROGRESS = /Answered (\d+)\/(\d+)/;

/** Engine CTA that opens the mic on a question the examiner reads as text. */
const START_ANSWERING = "Start answering";

/** Engine fallback CTA shown when the browser refuses to autoplay an examiner clip. */
const EXAMINER_TAP_TO_PLAY = "Tap to play the examiner";

/** Engine CTA that ends Part 2's preparation minute early. */
const PREP_START_NOW = "Start now →";

/** Engine submit control; it opens a confirm dialog whose primary button is "Submit". */
const SUBMIT = '[data-tour="submit"]';

/**
 * Engine essay editor. By placeholder, not by role: the list page keeps its "Tìm theo tên đề…"
 * search box in the tree across the navigation, and a bare textbox lookup grabs that instead.
 */
const ESSAY_PLACEHOLDER = "Type your response here…";

/** A question can sit behind a lead-in clip plus a preparation minute before the mic opens. */
const ANSWER_TIMEOUT_MS = 150_000;

/** Passes the per-centre fullscreen gate; a no-op for a centre that turned the policy off. */
export async function enterFullscreenIfGated(page: Page, ready?: Locator): Promise<void> {
  const enter = page.getByTestId("fullscreen-enter-btn");
  // Probing the gate alone races the page load — neither is up yet. Waiting for the gate OR the
  // screen behind it settles as soon as the page has decided which one it is.
  await expect(ready ? enter.or(ready) : enter).toBeVisible({ timeout: 20_000 });
  if (!(await enter.isVisible().catch(() => false))) return;
  await enter.click();
  await expect(enter).toBeHidden({ timeout: 10_000 });
}

/** Skips the mic-test screen and clears the fullscreen gate behind it. */
export async function startExam(page: Page): Promise<void> {
  await expect(page.getByTestId("skip-mic-btn")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("skip-mic-btn").click();
  await enterFullscreenIfGated(page, page.getByText(PROGRESS).first());
}

/** Reads the engine's section-wide "Answered X/Y" progress. */
export async function readProgress(page: Page): Promise<{ answered: number; total: number }> {
  const progress = page.getByText(PROGRESS).first();
  await expect(progress).toBeVisible({ timeout: 30_000 });
  const text = (await progress.textContent()) ?? "";
  const match = PROGRESS.exec(text);
  if (!match) throw new Error(`readProgress: progress text did not match: ${text}`);
  return { answered: Number(match[1]), total: Number(match[2]) };
}

/**
 * Clears whatever holds the mic shut: "Start answering" on a text question, "tap to play" when
 * the browser refused to autoplay a lead-in, and Part 2's preparation minute. All three are
 * buttons a real candidate presses, so pressing them is the faithful wait.
 */
async function releaseExaminerHold(page: Page): Promise<void> {
  for (const name of [EXAMINER_TAP_TO_PLAY, PREP_START_NOW, START_ANSWERING]) {
    const button = page.getByRole("button", { name });
    if (await button.isVisible({ timeout: 500 }).catch(() => false)) {
      await button.click().catch(() => {});
    }
  }
}

/** The section progress, or null once the page has left the runner (submitted). */
async function currentAnswered(page: Page): Promise<number | null> {
  const text = await page
    .getByText(PROGRESS)
    .first()
    .textContent({ timeout: 1_000 })
    .catch(() => null);
  const match = text ? PROGRESS.exec(text) : null;
  return match ? Number(match[1]) : null;
}

/**
 * Drives the section until one more answer has landed.
 *
 * Driven by the answered count, not by the forward control: that control is ALSO enabled on an
 * already-answered question, so a loop keyed on it silently skips a question and then hangs.
 */
export async function answerCurrentQuestion(page: Page): Promise<void> {
  const forward = page.locator(FORWARD);
  // readProgress, not currentAnswered: the baseline must be a real count. A null baseline would
  // make "one more than before" unsatisfiable and the loop would run to its deadline.
  const { answered: before } = await readProgress(page);
  const deadline = Date.now() + ANSWER_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const answered = await currentAnswered(page);
    // null = the runner submitted and the host routed away, which only the final take can cause.
    if (answered === null || answered > before) return;

    await releaseExaminerHold(page);
    if (await forward.isEnabled().catch(() => false)) {
      await forward.click().catch(() => {});
    }
    await page.waitForTimeout(500);
  }

  throw new Error(
    `answerCurrentQuestion: no further answer landed within ${ANSWER_TIMEOUT_MS}ms (answered ${before})`,
  );
}

/**
 * Answers every question in order. Completing the set is what triggers the runner's automatic
 * submit, so the caller decides what to expect of it — success routes away, a reject does not.
 */
export async function answerAllSpeakingQuestions(page: Page): Promise<void> {
  const { total } = await readProgress(page);
  for (let done = 0; done < total; done++) {
    await answerCurrentQuestion(page);
  }
}

/** Answers the whole section and waits for the automatic submit to route back to the list. */
export async function completeSpeakingRunner(page: Page): Promise<void> {
  await answerAllSpeakingQuestions(page);
  await expect(page).toHaveURL("/student/assignments", { timeout: 60_000 });
}

/** Takes a known assignment directly, when `.first()` ordering on the list cannot be trusted. */
export async function completeSpeakingAssignmentById(
  page: Page,
  assignmentId: string,
): Promise<void> {
  await page.goto(`/student/take/${assignmentId}`);
  await startExam(page);
  await completeSpeakingRunner(page);
}

/** Takes the first pending assignment; returns its id so callers can poll the result. */
export async function completeSpeakingAssignment(page: Page): Promise<string> {
  await page.goto("/student/assignments");

  await expect(page.getByRole("heading", { level: 1, name: "Bài tập" })).toBeVisible({
    timeout: 15_000,
  });

  const takeLink = page.getByRole("link", { name: "Làm bài" }).first();
  await expect(takeLink).toBeVisible({ timeout: 10_000 });

  const href = await takeLink.getAttribute("href");
  const assignmentId = href?.split("/").pop() ?? "";
  if (!assignmentId) {
    throw new Error("completeSpeakingAssignment: could not read the assignmentId from the take link");
  }

  await takeLink.click();
  await startExam(page);
  await completeSpeakingRunner(page);

  return assignmentId;
}

/**
 * Writes every Writing task and submits. No mic test, but the fullscreen gate still applies, and
 * multi-task papers switch through the engine's task tabs — there is no next/prev.
 */
export async function completeWritingAssignment(page: Page, essays: string[]): Promise<void> {
  const editor = page.getByPlaceholder(ESSAY_PLACEHOLDER);
  await enterFullscreenIfGated(page, editor);
  await expect(editor).toBeVisible({ timeout: 20_000 });

  const tabs = page.getByRole("tab");
  const taskCount = await tabs.count();

  for (const [index, essay] of essays.entries()) {
    if (taskCount > 1) {
      await tabs.nth(index).click();
    }
    await editor.fill(essay);
  }

  await page.locator(SUBMIT).click();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
}
