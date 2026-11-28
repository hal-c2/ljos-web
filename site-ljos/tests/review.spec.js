// The framework review (features/review.feature): the same inbox app in
// each framework, as data (bundle/Review/review.json), shown before any
// script runs with a section for each framework picked to start and
// every framework's links; with script a reader picks the frameworks to
// compare and the charts, the table, the code and the fans' sections
// show those and no other.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(here, "dist");
const review = JSON.parse(readFileSync(join(here, "bundle/Review/review.json"), "utf8"));
const base = (process.env.LJOS_SITE_BASE ?? "/").replace(/\/?$/, "/");
const route = `${base}review/`;
const hydrated = '#app[data-ljos-hydrated="true"]';
const TITLE = "Totally biased review of mostly Rust UI frameworks";
const named = (id) => review.frameworks.find((one) => one.id === id).name;
// What the page compares as it opens, by name.
const firstPicked = review.picked.map(named);
const kindOf = (id) => review.frameworks.find((one) => one.id === id).kind;
// A group of a metric's chart, as a list of its bars
// (Site/ReviewChart.qml): native and web apps each have their own where
// they are measured differently, and one group holds both where they
// are not.
const groupName = (metric, group) => (group.kind === "all" ? `${metric.label}, ${metric.unit}` : `${metric.label}, ${group.kind} apps, ${metric.unit}`);
const groupOf = (page, metric, group) => page.getByRole("list", { name: groupName(metric, group), exact: true });
// The names of a list's bars, each read from the bar's own
// ("Ljós: 80.9 ms").
const namesIn = async (list) => (await list.getByRole("listitem").evaluateAll((items) => items.map((item) => item.getAttribute("aria-label") ?? ""))).map((name) => name.split(":")[0]);
// The frameworks a chart has a bar for, in any of its groups.
async function barsOf(page, metric) {
  const names = [];
  for (const group of metric.groups) names.push(...(await namesIn(groupOf(page, metric, group))));
  return names.sort();
}
// The metrics a framework in `ids` has a value for: a chart leaves out
// a framework it has no number of, and says so.
// A command as it is drawn: the text wraps to its width, and a wrapped
// line ends in a line break that reads as a space (after "harness/", say),
// so the match allows one between any two characters and nothing else.
const wrapped = (text) => new RegExp(`^${[...text].map((char) => char.replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&")).join("\\s?")}$`, "u");
const measured = (metric, ids) => ids.filter((id) => metric.values[id] != null).map(named).sort();
const placeholders = () => review.metrics.some((metric) => Object.values(metric.values).some((value) => value?.placeholder)) || review.features.some((feature) => Object.values(feature.excerpts).some((excerpt) => excerpt?.placeholder)) || review.frameworks.some((one) => one.prose.placeholder);

test("the data names every framework once, with its links, and picks two or more to start", () => {
  const ids = review.frameworks.map((one) => one.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(review.picked.length).toBeGreaterThanOrEqual(2);
  for (const id of review.picked) expect(ids).toContain(id);
  for (const one of review.frameworks) {
    for (const link of ["site", "docs", "repo"]) expect(one.links[link], `${one.id}'s ${link}`).toMatch(/^https:\/\//);
    expect(["native", "web"]).toContain(one.kind);
    expect(one.prose.limits.length, `${one.id} says where it is not as strong`).toBeGreaterThan(0);
  }
  // Every number names how it was made and how many runs it is, in a
  // group of its own kind: native and web apps share one only where they
  // were measured the same way.
  for (const metric of review.metrics) {
    expect(metric.groups.length, metric.id).toBeGreaterThan(0);
    for (const group of metric.groups) {
      expect(["native", "web", "all"], metric.id).toContain(group.kind);
      expect(group.how, `${metric.id} ${group.kind}`).toBeTruthy();
      expect(group.command, `${metric.id} ${group.kind}`).toBeTruthy();
    }
    expect(metric.groups.some((group) => group.kind === "all") ? metric.groups.length : 1, `${metric.id}: "all" stands alone`).toBe(1);
    for (const [id, value] of Object.entries(metric.values)) {
      expect(ids, `${metric.id} has a value for ${id}`).toContain(id);
      if (value === null) continue;
      expect(metric.groups.some((group) => group.kind === "all" || group.kind === kindOf(id)), `${metric.id} has a group for ${id}`).toBe(true);
      // A size or a line count is counted once; a timing is run three
      // times at least.
      expect(value.runs, `${metric.id} ${id}`).toBeGreaterThanOrEqual(value.placeholder ? 0 : metric.counted ? 1 : 3);
      if (value.stat !== undefined) expect(["p95"], `${metric.id} ${id}`).toContain(value.stat);
      expect(value.min, `${metric.id} ${id}`).toBeLessThanOrEqual(value.median);
      expect(value.max, `${metric.id} ${id}`).toBeGreaterThanOrEqual(value.median);
    }
  }
});

test("search finds the review by its name", async ({ browser }) => {
  const listed = JSON.parse(readFileSync(join(dist, "search.json"), "utf8"));
  expect(listed.filter((one) => one.route === "/review/")).toEqual([{ route: "/review/", title: TITLE, headings: [] }]);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(`${base}start/`);
    await page.waitForSelector(hydrated);
    await page.getByRole("textbox", { name: "Search", exact: true }).filter({ visible: true }).first().click();
    await page.keyboard.type("biased");
    await expect(page.getByRole("list", { name: "Search results" }).getByText(TITLE, { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("with no script, every page's footer leads to the review, and the review stands whole", async ({ browser }) => {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 } });
    try {
      const page = await context.newPage();
      for (const at of [base, `${base}start/`, `${base}showcase/`]) {
        await page.goto(at);
        await expect(page.getByRole("contentinfo").getByRole("link", { name: "Framework review", exact: true }), at).toHaveAttribute("href", route);
      }
      await page.goto(route);
      await expect(page).toHaveTitle(`${TITLE} — Ljós`);
      await expect(page.getByRole("heading", { level: 1, name: TITLE, exact: true })).toBeVisible();
      // Written as laid out, a line to an element: a line may break anywhere in it.
      await expect(page.getByRole("main")).toContainText(/bias\s+is\s+the\s+point/u);
      // A fan's section for each framework picked to start, and for no
      // other.
      for (const one of review.frameworks.filter(({ id }) => !review.picked.includes(id))) {
        await expect(page.getByRole("region", { name: `${one.name}, by a fan`, exact: true }), one.id).toHaveCount(0);
      }
      for (const one of review.frameworks.filter(({ id }) => review.picked.includes(id))) {
        const section = page.getByRole("region", { name: `${one.name}, by a fan`, exact: true });
        await expect(section.getByRole("heading", { level: 3, name: one.name, exact: true })).toBeAttached();
        // What its fan shows first is the inbox's own code, under its
        // file and lines.
        expect(one.prose.shows.length, `${one.id} shows its code`).toBeGreaterThan(0);
        for (const excerpt of one.prose.shows) {
          await expect(section.getByText(`${excerpt.file}:${excerpt.lines}`, { exact: true }), one.id).toBeAttached();
          // Prerendered text breaks its lines with a newline, after a
          // space or a hyphen ("hand-\nwritten").
          const caption = new RegExp(`^${excerpt.caption.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/ /gu, "\\s+").replace(/-/gu, "-\\s*")}$`, "u");
          await expect(section.getByText(caption), one.id).toBeAttached();
        }
        await expect(section.getByRole("link", { name: `${one.name} website`, exact: true })).toHaveAttribute("href", one.links.site);
        await expect(section.getByRole("link", { name: `${one.name} docs`, exact: true })).toHaveAttribute("href", one.links.docs);
        await expect(section.getByRole("link", { name: `${one.name} repository`, exact: true })).toHaveAttribute("href", one.links.repo);
        await expect(section.getByRole("heading", { name: "Where it is not as strong", exact: true })).toBeAttached();
      }
      // Every framework, picked or not, is a link away.
      const found = page.getByRole("region", { name: "Where to find each one", exact: true });
      for (const one of review.frameworks) {
        await expect(found.getByRole("link", { name: `${one.name} website`, exact: true }), one.id).toHaveAttribute("href", one.links.site);
        await expect(found.getByRole("link", { name: `${one.name} docs`, exact: true }), one.id).toHaveAttribute("href", one.links.docs);
        await expect(found.getByRole("link", { name: `${one.name} repository`, exact: true }), one.id).toHaveAttribute("href", one.links.repo);
      }
      // The charts are written for the frameworks picked to start.
      for (const metric of review.metrics) expect(await barsOf(page, metric), metric.id).toEqual(measured(metric, review.picked));
    } finally {
      await context.close();
    }
  }
});

// Each excerpt is cut from an app that builds and runs, so nothing in
// it is marked broken: QML's members cut from an object (a delegate's
// required properties) are coloured as the inside of one.
test("no code the review shows is marked as broken", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(route);
    await expect(page.locator(".tok-keyword").first()).toBeAttached();
    await expect(page.locator(".tok-invalid")).toHaveCount(0);
  } finally {
    await context.close();
  }
  const page = await browser.newPage();
  try {
    await page.goto(route);
    await page.waitForSelector(hydrated);
    // Every framework picked, so every fan's code and every feature's is
    // there to be read.
    const picker = page.getByRole("group", { name: "Frameworks to compare", exact: true });
    for (const one of review.frameworks.filter(({ id }) => !review.picked.includes(id))) await picker.getByRole("button", { name: one.name, exact: true }).click();
    await expect(page.getByRole("region", { name: /, by a fan$/u })).toHaveCount(review.frameworks.length);
    for (const feature of review.features) {
      await page.getByRole("tab", { name: feature.label, exact: true }).click();
      await expect(page.locator(".tok-keyword").first(), feature.id).toBeAttached();
      await expect(page.locator(".tok-invalid"), feature.id).toHaveCount(0);
    }
  } finally {
    await page.close();
  }
});

// The page carries each excerpt as its colouring alone where the code
// reads back out of it (scripts/build.mjs): what Copy gives is still the
// code as written, every excerpt of every fan and every feature.
test("each excerpt's Copy copies its code as written", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const page = await context.newPage();
    await page.goto(route);
    await page.waitForSelector(hydrated);
    const picker = page.getByRole("group", { name: "Frameworks to compare", exact: true });
    const rest = review.frameworks.filter(({ id }) => !review.picked.includes(id)).map(({ id }) => id);
    for (const id of rest) await picker.getByRole("button", { name: named(id), exact: true }).click();
    const copies = async (where, excerpts) => {
      const cards = where.getByRole("group", { name: /^Code: / });
      await expect(cards, where.toString()).toHaveCount(excerpts.length);
      for (const [at, excerpt] of excerpts.entries()) {
        await cards.nth(at).getByRole("button", { name: /^(Copy|Copied)\b/u }).click();
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), `${excerpt.file}:${excerpt.lines}`).toBe(excerpt.code.replace(/\n$/u, ""));
      }
    };
    for (const one of review.frameworks) await copies(page.getByRole("region", { name: `${one.name}, by a fan`, exact: true }), one.prose.shows);
    const code = page.getByRole("region", { name: "The code of each picked framework", exact: true });
    for (const feature of review.features) {
      await page.getByRole("tablist", { name: "Feature", exact: true }).getByRole("tab", { name: feature.label, exact: true }).click();
      await copies(code, [...review.picked, ...rest].map((id) => feature.excerpts[id]).filter((excerpt) => excerpt !== undefined));
    }
  } finally {
    await context.close();
  }
});

test("a placeholder number or excerpt is said to be one", async ({ page }) => {
  await page.goto(route);
  await page.waitForSelector(hydrated);
  // The notice stays in the page, hidden, once nothing stands in.
  const notice = page.getByText("Placeholder data", { exact: true });
  if (placeholders()) await expect(notice).toBeVisible();
  else await expect(notice).toBeHidden();
});

test("native and web numbers are drawn on scales of their own", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(route);
    await page.waitForSelector(hydrated);
    const split = review.metrics.find((metric) => metric.groups.length === 2);
    expect(split, "a metric measured one way for native apps and another for web apps").toBeTruthy();
    // A native and a web framework both measured, picked together.
    const picker = page.getByRole("group", { name: "Frameworks to compare", exact: true });
    const now = [...review.picked];
    for (const kind of ["native", "web"]) {
      if (now.some((id) => kindOf(id) === kind && split.values[id] != null)) continue;
      const one = review.frameworks.find((framework) => framework.kind === kind && split.values[framework.id] != null);
      await picker.getByRole("button", { name: one.name, exact: true }).click();
      now.push(one.id);
    }
    const chart = page.getByRole("region", { name: split.label, exact: true });
    await expect(chart.getByText("Native and web apps are measured differently here, so each has a scale of its own: compare within a group, not across.", { exact: true })).toBeVisible();
    // The widest bar of each group: its median over the most of the
    // group's runs is its length over the track, whatever the other
    // group holds.
    const fill = [];
    for (const group of split.groups) {
      const ids = now.filter((id) => kindOf(id) === group.kind && split.values[id] != null);
      const list = groupOf(page, split, group);
      await expect.poll(async () => (await namesIn(list)).sort(), group.kind).toEqual(ids.map(named).sort());
      await expect(chart.getByText(group.how, { exact: true }), group.kind).toBeVisible();
      await expect(chart.getByText(wrapped(group.command)), group.kind).toBeAttached();
      const reach = Math.max(split.floor ?? 0, ...ids.map((id) => split.values[id].max));
      const longest = ids.reduce((most, id) => (split.values[id].median > split.values[most].median ? id : most));
      const bar = list.locator(`[role="listitem"][aria-label^="${named(longest)}:"] [data-object-name="reviewBar"]`);
      // Each group's track is as wide as the other's, so its longest bar
      // stands at the same share of it.
      fill.push({ bar, share: split.values[longest].median / reach });
    }
    // A framework picked just now grows its bar in, so the widths are
    // read until it stands at its length.
    await expect
      .poll(async () => {
        const tracks = await Promise.all(fill.map(async ({ bar, share }) => (await bar.boundingBox()).width / share));
        return Math.abs(tracks[0] - tracks[1]) / Math.max(...tracks);
      }, `${split.id}: each group on its own scale`)
      .toBeLessThan(0.03);
  } finally {
    await context.close();
  }
});

test("a spread too small to matter is drawn small", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(route);
    await page.waitForSelector(hydrated);
    const floored = review.metrics.filter((metric) => metric.floor != null);
    expect(floored.map((metric) => metric.id)).toContain("idle-cpu");
    for (const metric of floored) {
      for (const group of metric.groups) {
        const ids = review.picked.filter((id) => kindOf(id) === group.kind && metric.values[id] != null);
        const reach = Math.max(metric.floor, ...ids.map((id) => metric.values[id].max));
        for (const id of ids) {
          const item = groupOf(page, metric, group).locator(`[role="listitem"][aria-label^="${named(id)}:"]`);
          const row = (await item.boundingBox()).width;
          const value = metric.values[id];
          // The whisker over the row, against the spread over the axis:
          // the row is wider than the track, so it may only be less.
          await expect
            .poll(async () => (await item.locator('[data-object-name="reviewSpread"]').boundingBox()).width / row, `${metric.id} ${id}`)
            .toBeLessThanOrEqual(Math.max((value.max - value.min) / reach, 2 / row) + 0.001);
        }
      }
    }
  } finally {
    await context.close();
  }
});

test("picking frameworks changes the charts, the table and the code, and two always stay", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(route);
    await page.waitForSelector(hydrated);
    const picker = page.getByRole("group", { name: "Frameworks to compare", exact: true });
    const choice = (name) => picker.getByRole("button", { name, exact: true });
    for (const one of review.frameworks) await expect(choice(one.name)).toHaveAttribute("aria-pressed", review.picked.includes(one.id) ? "true" : "false");
    // The fans' sections are the picked frameworks', in the data's order.
    const sections = page.getByRole("region", { name: /, by a fan$/u });
    const fans = (ids) => review.frameworks.filter((one) => ids.includes(one.id)).map((one) => `${one.name}, by a fan`);
    const sectionsAre = (ids) => expect.poll(() => sections.evaluateAll((all) => all.map((one) => one.getAttribute("aria-label"))), "the fans' sections").toEqual(fans(ids));
    await sectionsAre(review.picked);

    const added = review.frameworks.find((one) => !review.picked.includes(one.id));
    await choice(added.name).click();
    await expect(choice(added.name)).toHaveAttribute("aria-pressed", "true");
    const now = [...review.picked, added.id];
    for (const metric of review.metrics) await expect.poll(() => barsOf(page, metric), metric.id).toEqual(measured(metric, now));
    await sectionsAre(now);

    // The table names each picked framework once, with its values.
    await page.getByRole("button", { name: "Show the numbers as a table", exact: true }).click();
    const table = page.getByRole("table", { name: "The numbers of the picked frameworks", exact: true });
    await expect(table.getByRole("rowheader")).toHaveText(now.map(named));
    const metric = review.metrics.find((one) => one.values[added.id] != null);
    const value = metric.values[added.id];
    await expect(table.getByRole("row", { name: new RegExp(`^${added.name}\\b`, "u") })).toContainText(`${value.min}–${value.max}`);
    for (const group of metric.groups) await expect(page.getByText(wrapped(group.command)).first()).toBeAttached();

    // The code of one feature, for the picked frameworks only.
    const search = review.features.find((feature) => feature.id === "search");
    await page.getByRole("tablist", { name: "Feature", exact: true }).getByRole("tab", { name: search.label, exact: true }).click();
    const code = page.getByRole("region", { name: "The code of each picked framework", exact: true });
    // Ljós and Ljós web run the same file, so a place can be shown once
    // for each picked framework whose lines it is.
    const where = (excerpt) => `${excerpt.file}:${excerpt.lines}`;
    for (const one of review.frameworks) {
      const excerpt = search.excerpts[one.id];
      if (!excerpt) continue;
      const sharing = now.filter((id) => search.excerpts[id] && where(search.excerpts[id]) === where(excerpt)).length;
      await expect(code.getByText(where(excerpt), { exact: true }), one.id).toHaveCount(sharing);
    }

    // Putting back all but two leaves those two, which cannot be put back.
    for (const id of now.slice(2)) await choice(named(id)).click();
    for (const id of now.slice(0, 2)) {
      await choice(named(id)).click();
      await expect(choice(named(id))).toHaveAttribute("aria-pressed", "true");
    }
    await expect(page.getByText("Compare at least two.", { exact: true })).toBeVisible();
    await sectionsAre(now.slice(0, 2));
  } finally {
    await context.close();
  }
});

for (const width of [390, 1440]) {
  for (const colorScheme of ["light", "dark"]) {
    test(`at ${width} wide in ${colorScheme}, nothing stands wider than the window`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme, viewport: { width, height: 900 } });
      try {
        const page = await context.newPage();
        await page.goto(route);
        await page.waitForSelector(hydrated);
        const wider = await page.evaluate(() => {
          const width = document.documentElement.clientWidth;
          return [...document.querySelectorAll("#app *")]
            .filter((element) => {
              const box = element.getBoundingClientRect();
              return box.width > 0 && (box.right > width + 1 || box.left < -1) && !element.closest("qq-flick, pre, code");
            })
            .slice(0, 5)
            .map((element) => `${element.tagName} ${element.getAttribute("aria-label") ?? element.textContent.slice(0, 40)}`);
        });
        expect(wider).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      } finally {
        await context.close();
      }
    });
  }
}

// With less motion what grows only fades (Site/Theme.qml): a new bar
// stands at its length from the first frame and fades in, so it never
// snaps; with motion it grows as it fades.
test("with less motion a new bar fades in at its length, and with motion it grows", async ({ browser }) => {
  const seen = {};
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const context = await browser.newContext({ reducedMotion, viewport: { width: 1440, height: 900 } });
    try {
      const page = await context.newPage();
      await page.goto(route);
      await page.waitForSelector(hydrated);
      const metric = review.metrics[0];
      const added = review.frameworks.find((one) => !review.picked.includes(one.id) && metric.values[one.id] != null);
      // Each frame's width and opacity from the bar's first frame until
      // both rest, watched from before the click so no frame is missed.
      await page.evaluate(
        ([list, name]) => {
          window.__frames = new Promise((done) => {
            const frames = [];
            const step = () => {
              const chart = document.querySelector(`[role="list"][aria-label="${list}"]`);
              const item = [...(chart?.querySelectorAll('[role="listitem"]') ?? [])].find((one) => (one.getAttribute("aria-label") ?? "").startsWith(`${name}:`));
              const bar = item?.querySelector('[data-object-name="reviewBar"]');
              if (bar) {
                frames.push([bar.getBoundingClientRect().width, Number(getComputedStyle(bar.closest("[data-object-name='reviewItem']") ?? bar).opacity)]);
                const last = frames[frames.length - 1];
                if (frames.length > 6 && frames.slice(-6).every((one) => one[0] === last[0] && one[1] === last[1])) return done(frames);
              }
              requestAnimationFrame(step);
            };
            step();
          });
        },
        [groupName(metric, metric.groups.find((group) => group.kind === "all" || group.kind === added.kind)), added.name],
      );
      await page.getByRole("group", { name: "Frameworks to compare", exact: true }).getByRole("button", { name: added.name, exact: true }).click();
      seen[reducedMotion] = await page.evaluate(() => window.__frames);
    } finally {
      await context.close();
    }
  }
  const final = (frames) => frames[frames.length - 1];
  const widths = (frames) => new Set(frames.map((one) => Math.round(one[0])));
  const opacities = (frames) => new Set(frames.map((one) => one[1]));
  const calm = seen.reduce;
  const full = seen["no-preference"];
  expect(final(calm)[0]).toBeCloseTo(final(full)[0], 0);
  expect(final(calm)[1]).toBe(1);
  // Less motion: one width throughout, and a fade on the way, not a snap.
  expect(widths(calm).size, JSON.stringify(calm)).toBe(1);
  expect(opacities(calm).size, JSON.stringify(calm)).toBeGreaterThan(2);
  // Motion: it grows to its length over several frames.
  expect(widths(full).size, JSON.stringify(full)).toBeGreaterThan(2);
});
