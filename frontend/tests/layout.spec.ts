import { test, expect, type Locator, type Page } from "@playwright/test";

async function ready(page: Page, view = "overview") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/#${view}`);
  await expect(page.locator(".analysis-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
}

async function withinViewport(locator: Locator, page: Page, gutter = 0) {
  const viewport = page.viewportSize()!;
  await expect(locator).toBeVisible();
  await expect
    .poll(async () => {
      const box = await locator.boundingBox();

      return (
        !!box &&
        box.x >= gutter - 1 &&
        box.y >= gutter - 1 &&
        box.x + box.width <= viewport.width - gutter + 1 &&
        box.y + box.height <= viewport.height - gutter + 1
      );
    })
    .toBe(true);
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 768, height: 600 },
  { width: 1440, height: 900 },
  { width: 844, height: 390 },
]) {
  test(`dialogs stay centered with reachable controls at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await ready(page);
    await page.getByRole("button", { name: "More filters" }).click();
    const dialog = page.getByRole("dialog");
    await withinViewport(dialog, page, 12);
    const box = (await dialog.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(
      1,
    );
    expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(
      1,
    );
    const heading = dialog.getByRole("heading", { name: "Refine your cohort" });
    const headingBefore = await heading.boundingBox();
    const body = dialog.locator('[data-slot="dialog-body"]');
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(await heading.boundingBox()).toEqual(headingBefore);
    await withinViewport(
      dialog.getByRole("button", { name: "Close", exact: true }),
      page,
    );
    await withinViewport(
      dialog.getByRole("button", { name: "View analysis" }),
      page,
    );
    await dialog.getByRole("button", { name: "View analysis" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "More filters" }),
    ).toBeFocused();

    await page.locator(".player-name").first().click();
    await withinViewport(dialog, page, 12);
    await dialog.locator('[data-slot="dialog-body"]').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(
      dialog.getByRole("heading", { name: "Tournament history" }),
    ).toBeInViewport();
    await withinViewport(
      dialog.getByRole("button", { name: "Close", exact: true }),
      page,
    );
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });
}

test("mobile filters and long dropdown options stay inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await ready(page);
  const controls = page.locator(".filter-main .select-control");

  const boxes = await Promise.all(
    (await controls.all()).map((control) => control.boundingBox()),
  );

  expect(boxes[0]!.y).toBe(boxes[1]!.y);
  expect(boxes[0]!.width).toBe(boxes[1]!.width);
  expect(boxes[0]!.x).toBe(boxes[2]!.x);
  await page.getByRole("button", { name: "More filters" }).click();
  await page.getByRole("combobox", { name: "All tournaments" }).click();
  await withinViewport(page.getByRole("listbox"), page, 12);
  await page.keyboard.press("End");
  await expect(page.getByRole("option").last()).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("chart tooltips and player previews fit at mobile chart edges", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page, "roles");
  const chart = page.locator(".comparison-chart");
  await chart.scrollIntoViewIfNeeded();
  const chartBox = (await chart.boundingBox())!;

  for (const offset of [50, chartBox.width - 24]) {
    await page.mouse.move(
      chartBox.x + offset,
      chartBox.y + chartBox.height / 2,
    );
    await withinViewport(page.locator(".chart-tooltip"), page, 8);
    expect(
      await page
        .locator(".chart-tooltip")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
  }

  await page.mouse.move(0, 0);
  const points = page.locator(".scatter circle");

  for (const point of [points.first(), points.last()]) {
    await point.scrollIntoViewIfNeeded();
    await point.focus();
    await withinViewport(page.locator(".player-point-preview"), page, 12);
    const values = await page.locator(".point-preview-values dd").all();
    expect((await values[0].boundingBox())!.y).toBe(
      (await values[1].boundingBox())!.y,
    );
    await page.keyboard.press("Escape");
    await expect(page.locator(".player-point-preview")).not.toBeVisible();
  }

  const point = points.first();
  await point.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(point).toBeFocused();
});
