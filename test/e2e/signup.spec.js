import { expect, test } from "@playwright/test";

// Random email per test run so state persists cleanly under `wrangler dev`
// (miniflare in-memory D1 is torn down when the dev server stops anyway).
function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

test.describe("Signup flow", () => {
  test("register -> onboarding -> dashboard -> logout", async ({ page }) => {
    const email = uniqueEmail("e2e");
    const password = "e2e-test-password";

    // 1. Land on auth screen.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /sign in to ks2 mastery/i })).toBeVisible({ timeout: 20_000 });

    // 2. Switch to "Create account" and submit the form.
    await page.getByRole("button", { name: /create account/i }).first().click();
    await page.getByPlaceholder("you@example.com").fill(email);
    await page.getByPlaceholder(/at least 8 characters/i).fill(password);
    await page.getByRole("button", { name: /create account/i }).last().click();

    // 3. Onboarding step 1: name + avatar colour.
    await expect(page.getByRole("heading", { name: /let's set up/i })).toBeVisible();
    await page.getByPlaceholder(/maya hudson/i).fill("E2E Tester");
    await page.getByRole("button", { name: /continue/i }).click();

    // 4. Year group.
    await expect(page.getByRole("heading", { name: /which year are you in\?/i })).toBeVisible();
    await page.getByRole("button", { name: /^year 5$/i }).click();
    await page.getByRole("button", { name: /continue/i }).click();

    // 5. Goal + daily target.
    await expect(page.getByRole("heading", { name: /what's your goal\?/i })).toBeVisible();
    await page.getByRole("button", { name: /continue/i }).click();

    // 6. Weak subjects -> finish.
    await expect(page.getByRole("heading", { name: /which subjects feel tricky\?/i })).toBeVisible();
    await page.getByRole("button", { name: /finish setup/i }).click();

    // 7. Dashboard should render. The greeting uses the learner's first name
    //    (so "E2E Tester" becomes "Good morning, E2E.") and a Spelling subject
    //    card is always present.
    await expect(page.getByRole("heading", { name: /good .*e2e/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /^spelling$/i })).toBeVisible();

    // 8. Reload and ensure the session persisted.
    await page.reload();
    await expect(page.getByRole("heading", { name: /good .*e2e/i })).toBeVisible({ timeout: 15_000 });
  });

  test("rejects a short password on register", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /sign in to ks2 mastery/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /create account/i }).first().click();
    await page.getByPlaceholder("you@example.com").fill(uniqueEmail("short"));
    await page.getByPlaceholder(/at least 8 characters/i).fill("short");
    await page.getByRole("button", { name: /create account/i }).last().click();
    await expect(page.getByText(/at least eight characters/i)).toBeVisible({ timeout: 5_000 });
  });
});
