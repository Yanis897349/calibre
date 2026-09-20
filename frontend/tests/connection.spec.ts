import { test, expect } from "@playwright/test";

test("connection retry keeps the panel and current settings until recovery", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".analysis-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );

  let attempts = 0;
  let releaseRetry = () => {};

  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });

  await page.route("**/api/analyze", async (route) => {
    expect(route.request().postDataJSON().dpi).toBe(1600);
    attempts++;

    if (attempts === 1) return route.abort("failed");

    await retryGate;
    await route.continue();
  });

  await page.getByRole("button", { name: "1600", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Can’t reach the server.",
  );
  await page.getByRole("button", { name: "Retry connection" }).click();
  await expect(
    page.getByRole("button", { name: "Reconnecting…" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "A break in the signal." }),
  ).toBeVisible();

  releaseRetry();
  await expect(page.locator(".connection-panel")).toHaveCount(0);
  await expect(page.locator(".analysis-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(attempts).toBe(2);
});

for (const failure of [
  {
    name: "empty proxy response",
    status: 502,
    body: "",
    contentType: "text/plain",
    message: "Can’t reach the server.",
  },
  {
    name: "server validation error",
    status: 400,
    body: JSON.stringify({ error: "Choose a valid DPI." }),
    contentType: "application/json",
    message: "Choose a valid DPI.",
  },
]) {
  test(`connection panel handles ${failure.name}`, async ({ page }) => {
    await page.route("**/api/analyze", (route) => route.fulfill(failure));
    await page.goto("/");
    await expect(page.getByRole("alert")).toContainText(failure.message);
    await page.getByRole("button", { name: "Retry connection" }).click();
    await expect(
      page.getByRole("button", { name: "Retry connection" }),
    ).toBeEnabled();
    await expect(page.getByRole("alert")).toContainText(failure.message);
  });
}
