import { test, expect, type Page } from "@playwright/test";
import type { Analysis, Filters } from "../src/types";

async function ready(page: Page) {
  await expect(page.locator(".analysis-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
}

test("backend normalization, hierarchy, filters and empty cohorts", async ({
  request,
}) => {
  const analyze = async (
    dpi: number,
    filters: Filters = {},
  ): Promise<Analysis> => {
    const r = await request.post("/api/analyze", { data: { dpi, filters } });
    expect(r.ok()).toBeTruthy();

    return r.json();
  };

  const base = await analyze(800);
  const high = await analyze(1600);

  for (const key of [
    "sources",
    "source_url",
    "source_updated_at",
    "acquisition",
    "competitive_url",
    "competitive_imported_at",
  ]) {
    expect(JSON.stringify(base)).not.toContain(`"${key}":`);
  }

  const metadata = await request.get("/api/meta");
  expect(await metadata.json()).not.toHaveProperty("sources");
  expect(high.summary?.peak).toBe(base.summary?.peak);

  if (!base.summary || !high.summary)
    throw new Error("Expected nonempty baseline cohorts");

  expect(high.summary.normalized * 2).toBeCloseTo(base.summary.normalized, 8);
  expect(base.players.length).toBeGreaterThan(100);
  expect(base.players.reduce((s, p) => s + p.contribution, 0)).toBeCloseTo(
    1,
    8,
  );
  expect(base.players.every((p) => p.contribution <= 0.10000001)).toBeTruthy();

  const anchor = await analyze(800, {
    roles: ["Sentinel"],
    anchor_min: 0.6,
    movement_max: 0.3,
  });

  expect(
    anchor.players.every(
      (p) =>
        p.role === "Sentinel" &&
        p.mechanical.anchor >= 0.6 &&
        p.mechanical.movement <= 0.3,
    ),
  ).toBeTruthy();

  if (anchor.summary) expect(anchor.summary.subgroup_share).toBeLessThan(1);
  const none = await analyze(800, { search: "no-player-with-this-name" });
  expect(none.summary).toBeNull();
  expect(none.players).toEqual([]);
  const invalid = await request.post("/api/analyze", { data: { dpi: 0 } });
  expect(invalid.status()).toBe(400);
});

test("overview controls, sorting, player details and keyboard dialog", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await ready(page);
  await expect(page.getByText("Where the pros land")).toBeVisible();
  const original = await page.locator(".recommend-value").innerText();
  await page.getByRole("button", { name: "1600", exact: true }).click();
  await ready(page);
  expect(await page.locator(".recommend-value").innerText()).not.toBe(original);
  await page.getByRole("tab", { name: "Histogram", exact: true }).click();
  await expect(
    page.getByRole("img", {
      name: "Weighted sensitivity histogram",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Density", exact: true }).click();
  await page.getByRole("button", { name: "More filters" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("checkbox", { name: "Show raw subgroup" }).check();
  await expect(
    page.getByRole("checkbox", { name: "Show raw subgroup" }),
  ).toBeChecked();
  const player = page.locator(".player-name").first();
  await player.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Mechanical fingerprint")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(player).toBeFocused();
  await page.getByRole("button", { name: "eDPI", exact: true }).first().click();
  await page
    .getByRole("button", { name: "Role comparison", exact: true })
    .click();
  await ready(page);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await ready(page);
  await expect(
    page.getByRole("checkbox", { name: "Show raw subgroup" }),
  ).toBeChecked();
  await expect(page.locator(".chart-axis-label")).toHaveText("EFFECTIVE DPI");
  await page.getByRole("button", { name: "eDPI", exact: true }).last().click();
  await page
    .getByRole("textbox", { name: "Search players" })
    .fill("no-player-with-this-name");
  await ready(page);
  await expect(page.getByText("No players in this cohort")).toBeVisible();
  expect(errors).toEqual([]);
});

test("role selection and profile presets", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("combobox", { name: "All roles", exact: true }).click();
  await page.getByRole("option", { name: "Sentinel", exact: true }).click();
  await ready(page);
  await expect(page.locator(".active-filters")).toContainText("Sentinel");
  await page.getByRole("button", { name: "My sensitivity" }).click();
  await page
    .getByRole("button", { name: "Chamber Operator", exact: true })
    .click();
  await ready(page);
  await expect(
    page.getByRole("slider", { name: "Operator tendency", exact: true }),
  ).toHaveAttribute("aria-valuenow", "0.85");
  await page
    .getByRole("slider", { name: "Operator tendency", exact: true })
    .focus();
  await page.keyboard.press("ArrowRight");
  await ready(page);
  await expect(
    page.getByRole("slider", { name: "Operator tendency", exact: true }),
  ).toHaveAttribute("aria-valuenow", "0.86");
});

test("mobile layout, navigation, reduced motion and comparison", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await ready(page);
  await expect(page.locator("h1")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "Role comparison", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Role distributions", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "Mechanical styles", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Mechanical-style distributions",
      exact: true,
    }),
  ).toBeVisible();
});

test("all player tables append rows while scrolling and reset for sorting and search", async ({
  page,
}) => {
  for (const view of ["overview", "profile", "players"]) {
    await page.goto(`/#${view}`);
    await ready(page);

    const table = page.getByRole("region", {
      name: "Player table",
      exact: true,
    });

    const rows = table.locator(".player-name");
    await expect(rows).toHaveCount(30);
    await expect(
      page.getByRole("button", { name: /^(Next|Previous)$/ }),
    ).toHaveCount(0);
    const first = await rows.first().innerText();
    await table.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(rows).toHaveCount(60);
    await expect(rows.first()).toHaveText(first, { useInnerText: true });

    const total = Number(
      (await page.locator(".table-footer [role=status]").innerText()).match(
        /of (\d+)/,
      )?.[1],
    );

    if (view === "players") {
      for (let count = 60; count < total; count += 30) {
        await table.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await expect(rows).toHaveCount(Math.min(count + 30, total));
      }

      const names = await rows.allTextContents();
      expect(new Set(names).size).toBe(total);
      await expect(table.locator(".table-sentinel")).toHaveCount(0);
      await rows.last().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
    }

    const nameHeader = table.getByRole("columnheader", {
      name: "Player",
      exact: true,
    });

    const previousSort = await nameHeader.getAttribute("aria-sort");
    await table.getByRole("button", { name: "Player", exact: true }).click();
    await expect(rows).toHaveCount(30);
    await expect
      .poll(() => table.evaluate((element) => element.scrollTop))
      .toBe(0);
    await expect(nameHeader).toHaveAttribute(
      "aria-sort",
      previousSort === "descending" ? "ascending" : "descending",
    );
    const search = page.getByRole("textbox", { name: "Search players" });
    await search.fill("aspas");
    await expect(rows).toHaveCount(1);
    await search.fill("no-player-with-this-name");
    await expect(rows).toHaveCount(0);
    await expect(page.getByText("No players in this cohort")).toBeVisible();
    await search.fill("");
    await expect(rows).toHaveCount(30);
  }
});

test("player history deduplicates repeat readings but retains changes, reversions and dates", async ({
  page,
}) => {
  await page.route("**/api/analyze", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const player = data.players[0];
    const setting = { ...player.setting, dpi: 800, sensitivity: 0.27 };
    player.history = [
      { ...setting, observed_at: "2026-09-18T09:00:00Z" },
      {
        ...setting,
        observed_at: "2026-09-18T09:05:00Z",
        source_url: "https://example.com/another-source",
      },
      {
        ...setting,
        observed_at: "2026-09-18T10:00:00Z",
        dpi: 1600,
        sensitivity: 0.135,
      },
      { ...setting, observed_at: "2026-09-18T11:00:00Z" },
      { ...setting, observed_at: "2026-09-19T09:00:00Z" },
    ];
    player.events = [
      {
        player: player.name,
        tournament: "Test event",
        year: 2026,
        tier: "International",
        placement: 1,
        date: "2026-09-18",
        source_url: "https://example.com/event",
      },
    ];
    await route.fulfill({ response, json: data });
  });
  await page.goto("/");
  await ready(page);
  await page.locator(".player-name").first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Setup" }).click();
  const observations = dialog.locator(".observations > div");
  await expect(observations).toHaveCount(4);
  await expect(observations.nth(1)).toContainText("1,600 DPI × 0.135");
  await expect(observations.nth(2)).toContainText("800 DPI × 0.270");
  await dialog.getByRole("tab", { name: "Career" }).click();
  await expect(dialog.locator(".event-row")).toContainText("2026");
  await expect(dialog.locator(".placement.gold")).toBeVisible();
  await expect(dialog.getByRole("link")).toHaveCount(0);
  await expect(page.locator('a[href^="http"]')).toHaveCount(0);
});

test("equipment ratio sliders preserve units, precision, stable bounds and reset", async ({
  page,
  request,
}) => {
  const meta = await (await request.get("/api/meta")).json();
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "More filters" }).click();
  const dialog = page.getByRole("dialog");

  for (const [label, key, step] of [
    ["eDPI", "edpi", 0.1],
    ["Native sensitivity", "sensitivity", 0.001],
    ["Native DPI", "dpi", 1],
  ] as const) {
    const lower = dialog.getByRole("slider", {
      name: `${label} minimum`,
      exact: true,
    });

    const upper = dialog.getByRole("slider", {
      name: `${label} maximum`,
      exact: true,
    });

    const maximum = meta.setting_ranges[key];
    expect(maximum).toBeGreaterThan(step);
    await expect(lower).toHaveAttribute("aria-valuenow", "0");
    await expect(upper).toHaveAttribute("aria-valuenow", String(maximum));
    await lower.focus();
    await page.keyboard.press("ArrowRight");
    await expect(lower).toHaveAttribute("aria-valuenow", String(step));
    await expect(lower).not.toHaveAttribute("aria-valuetext", /%/);
    await upper.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(upper).toHaveAttribute(
      "aria-valuenow",
      String(Number((maximum - step).toFixed(10))),
    );
    await ready(page);
    await expect(upper).toHaveAttribute("aria-valuemax", String(maximum));
  }

  await dialog.getByRole("button", { name: "Reset filters" }).click();

  for (const label of ["eDPI", "Native sensitivity", "Native DPI"]) {
    const lower = dialog.getByRole("slider", {
      name: `${label} minimum`,
      exact: true,
    });

    const upper = dialog.getByRole("slider", {
      name: `${label} maximum`,
      exact: true,
    });

    await expect(lower).toHaveAttribute("aria-valuenow", "0");
    expect(await upper.getAttribute("aria-valuenow")).toBe(
      await upper.getAttribute("aria-valuemax"),
    );
  }
});

test("multi-value filters, combat statistics and stat thresholds", async ({
  request,
}) => {
  // Older clients send single-value keys such as `agent`.
  const analyze = async (
    filters: Filters | { agent: string },
  ): Promise<Analysis> => {
    const r = await request.post("/api/analyze", {
      data: { dpi: 800, filters },
    });

    expect(r.ok()).toBeTruthy();

    return r.json();
  };

  const pair = await analyze({ agents: ["jett", "raze"], roles: ["Duelist"] });
  expect(pair.players.length).toBeGreaterThan(10);
  expect(
    pair.players.every(
      (p) =>
        p.role === "Duelist" &&
        p.agents.every((a) => a.name === "jett" || a.name === "raze"),
    ),
  ).toBeTruthy();

  const legacy = await analyze({ agent: "jett" });
  expect(
    legacy.players.every((p) => p.agents.every((a) => a.name === "jett")),
  ).toBeTruthy();

  const strict = await analyze({ kd_min: 1.1, hs_min: 0.25, maps: ["Ascent"] });
  expect(strict.players.length).toBeGreaterThan(0);
  expect(
    strict.players.every(
      (p) =>
        p.stats.kd! >= 1.1 &&
        p.stats.hs! >= 0.25 &&
        p.map_pool.every((m) => m.name === "Ascent"),
    ),
  ).toBeTruthy();

  const base = await analyze({});
  expect(base.role_profiles.map((r) => r.name)).toEqual([
    "Duelist",
    "Initiator",
    "Controller",
    "Sentinel",
    "Flex",
  ]);
  expect(base.cohort?.stats.kd).toBeGreaterThan(0.8);
  expect(base.players[0].percentiles.kd).toBeGreaterThanOrEqual(0);

  const invalid = await request.post("/api/analyze", {
    data: { dpi: 800, filters: { kd_min: 2, kd_max: 1 } },
  });

  expect(invalid.status()).toBe(400);
});

test("multi-select cohort chips, combat panels and table views", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("combobox", { name: "All roles", exact: true }).click();
  await page.getByRole("option", { name: "Duelist", exact: true }).click();
  await page.getByRole("option", { name: "Sentinel", exact: true }).click();
  await page.keyboard.press("Escape");
  await ready(page);
  const chips = page.locator(".active-filters");
  await expect(chips).toContainText("Role: Duelist");
  await expect(chips).toContainText("Role: Sentinel");
  await expect(page.getByText("How this cohort plays")).toBeVisible();
  await page.getByRole("button", { name: "Remove Role: Duelist" }).click();
  await ready(page);
  await expect(chips).not.toContainText("Duelist");
  await expect(
    page.locator(".player-table-panel").getByRole("cell", { name: "Duelist" }),
  ).toHaveCount(0);

  await page.locator(".player-name").first().click();
  await page.getByRole("tab", { name: "Combat" }).click();
  await expect(
    page.getByRole("heading", { name: "Combat statistics" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").locator(".weapon-card.operator .weapon-icon"),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Agents & maps" }).click();
  await expect(page.getByRole("heading", { name: "Map pool" })).toBeVisible();
  await expect(page.locator(".map-card img").first()).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Player database" }).click();
  await ready(page);
  await page.getByRole("button", { name: "Combat", exact: true }).click();
  await expect(page.getByRole("button", { name: "K/D" })).toBeVisible();
  await page
    .getByRole("button", { name: "Role comparison", exact: true })
    .click();
  await ready(page);
  await expect(page.getByText("Role combat profiles")).toBeVisible();
});

test("player modal browsing, shared links and filter sections", async ({
  page,
}) => {
  await page.goto("/?roles=Duelist&dpi=1600#players");
  await ready(page);
  await expect(page.locator(".active-filters")).toContainText("Role: Duelist");
  await expect(
    page.getByRole("button", { name: "1600", exact: true }),
  ).toHaveClass(/selected/);

  // The whole row opens the player, not only the name button.
  await page
    .locator(".player-table-panel tbody tr")
    .first()
    .locator("td")
    .nth(4)
    .click();
  const dialog = page.getByRole("dialog");
  const title = dialog.getByRole("heading", { level: 2 });
  const first = await title.innerText();
  await expect(page).toHaveURL(/player=/);
  await expect(dialog.getByText("Sensitivity @ 1,600 DPI")).toBeVisible();

  await dialog.getByRole("button", { name: "Next player" }).click();
  await expect(title).not.toHaveText(first);
  const second = await title.innerText();
  await page.keyboard.press("ArrowLeft");
  await expect(title).toHaveText(first);
  await page.keyboard.press("ArrowRight");
  await expect(title).toHaveText(second);

  const shared = page.url();
  await page.goto(shared);
  await expect(
    page.getByRole("dialog").getByRole("heading", { level: 2 }),
  ).toHaveText(second);

  await dialog.getByRole("tab", { name: "Setup" }).click();
  await expect(dialog.locator(".converter .current")).toContainText(
    "1,600 DPI",
  );
  await dialog.getByRole("tab", { name: "Career" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Role history" }),
  ).toBeVisible();

  await dialog.getByRole("tab", { name: "Compare" }).click();
  await dialog.locator(".compare-suggestion").first().click();
  await expect(dialog.locator(".compare-row")).toHaveCount(13);
  await expect(dialog.locator(".compare-side.second")).toBeVisible();
  await dialog.getByRole("button", { name: /Stop comparing/ }).click();
  await expect(
    dialog.getByRole("textbox", { name: "Search players to compare" }),
  ).toBeVisible();

  const agent = dialog.locator(".agent-chip").first();
  const agentName = (await agent.innerText()).split("\n")[0].trim();
  await agent.click();
  await expect(dialog).not.toBeVisible();
  await ready(page);
  await expect(page.locator(".active-filters")).toContainText(
    `Agent: ${agentName}`,
  );
  await expect(page).not.toHaveURL(/player=/);
  await expect(page).toHaveURL(/agents=/);

  await page.getByRole("button", { name: "More filters" }).click();
  const filters = page.getByRole("dialog");
  const nav = filters.getByRole("navigation", { name: "Filter sections" });
  await expect(nav.getByRole("button", { name: /Competition/ })).toContainText(
    "1",
  );
  await nav.getByRole("button", { name: /Weapons/ }).click();
  await expect(
    filters.getByRole("heading", { name: "Weapons" }),
  ).toBeInViewport();
  await filters.getByRole("button", { name: "Clear 1" }).click();
  await expect(
    nav.getByRole("button", { name: /Competition/ }),
  ).not.toContainText("1");
});
