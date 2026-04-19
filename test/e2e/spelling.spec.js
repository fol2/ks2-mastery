import { expect, test } from "@playwright/test";

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

// Runs through the full onboarding + child creation inline so each spelling
// test starts from a clean signed-in state with a single child profile.
async function signUpAndOnboard(page, name = "Spelling Kid") {
  const email = uniqueEmail("spell");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /sign in to ks2 mastery/i })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /create account/i }).first().click();
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder(/at least 8 characters/i).fill("e2e-test-password");
  await page.getByRole("button", { name: /create account/i }).last().click();

  await expect(page.getByRole("heading", { name: /let's set up/i })).toBeVisible();
  await page.getByPlaceholder(/maya hudson/i).fill(name);
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /^year 5$/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /finish setup/i }).click();
  // Dashboard greeting uses the first word of the learner's name.
  const firstName = name.split(/\s+/)[0];
  await expect(
    page.getByRole("heading", { name: new RegExp(`good .*${firstName}`, "i") }),
  ).toBeVisible({ timeout: 15_000 });
}

test.describe("Spelling session flow", () => {
  test("start smart session -> submit a word -> end session", async ({ page }) => {
    await signUpAndOnboard(page);

    // Navigate into the Spelling subject. The dashboard pattern exposes a
    // large "Spelling" card by title; click it.
    await page.getByRole("button", { name: /spelling/i }).first().click();

    // Dashboard appears with "Start Smart Review" CTA.
    await expect(page.getByRole("button", { name: /start smart review/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /start smart review/i }).click();

    // Spelling game mounts; the input placeholder is one of the three phase
    // strings. The first word should be focused on mount.
    const input = page.getByLabel(/type the spelling/i);
    await expect(input).toBeVisible({ timeout: 10_000 });

    // We don't know the target word client-side without reading the card's
    // sentence; easiest is to read the first cloze chunk out of the DOM.
    // Instead we just type something wrong and confirm the wrong-path UI.
    await input.fill("zzzzwrong");
    await page.getByRole("button", { name: /^submit$|^try again$|^lock it in$/i }).click();

    // The feedback banner should show up (either error chrome or a phase
    // transition). Either way, the dashboard has not replaced the game yet.
    await expect(page.getByLabel(/type the spelling/i)).toBeVisible({ timeout: 5_000 });

    // End the session early via "End session".
    await page.getByRole("button", { name: /end session/i }).click();

    // Summary or dashboard re-appears. "Session ended early" renders in two
    // spots on the summary screen (heading + sub), so scope to first().
    await expect(
      page.getByRole("button", { name: /start smart review/i })
        .or(page.getByText(/session ended early/i).first()),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("can navigate to Profiles tab and add a second child", async ({ page }) => {
    await signUpAndOnboard(page, "Kid One");

    await page.getByRole("button", { name: /spelling/i }).first().click();
    await page.getByRole("button", { name: /^profiles$/i }).click();

    await page.getByRole("button", { name: /^add child$/i }).click();
    await expect(page.getByRole("heading", { name: /add child profile/i })).toBeVisible();
    await page.getByLabel(/^name$/i).fill("Kid Two");
    await page.getByRole("button", { name: /^create$/i }).click();

    // Both children should show in the family panel. The name may appear
    // multiple times (family card + greeting-area initials), so scope to the
    // family panel entries explicitly via first().
    await expect(page.getByText("Kid One").first()).toBeVisible();
    await expect(page.getByText("Kid Two").first()).toBeVisible();
  });
});
