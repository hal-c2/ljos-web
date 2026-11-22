// /screenshots/: the pictures a deploy drew of every demo and shell,
// beside the ones the deploy before drew, read from the manifest the
// deploy writes beside the page (shots/compare.mjs). Here the page is
// given a manifest of the test's own, and pictures drawn here, so what
// it says is held against what it was told.
import { createRequire } from "node:module";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";

const sha = "4f1c9e2ab7d3f0e8c6a5b4d3e2f1a0b9c8d7e6f5";
const before = "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b";

const shot = (id, over) => {
  const [target, kernel, gpu, scheme, size] = id.split(".");
  const viewport = size === "phone" ? { name: "phone", width: 390, height: 844 } : { name: "desktop", width: 1440, height: 900 };
  return {
    id,
    target,
    kind: target.startsWith("shell") ? "shell" : "demo",
    title: target === "shell-default" ? "The front page, default shell" : "Svala GT",
    route: target === "shell-default" ? "/" : "/demos/cockpit/",
    kernel,
    gpu: gpu === "dom" ? null : gpu,
    scheme,
    shell: "",
    viewport,
    file: `now/${id}.png`,
    thumb: `now/${id}.webp`,
    width: viewport.width,
    height: viewport.height,
    health: { ok: true, problems: [] },
    moving: [],
    drawnBy: { browser: "chromium", version: "158.0.8127.18", api: gpu === "dom" ? null : gpu, adapter: "amd rdna-3", kind: "hardware" },
    before: { file: `before/${id}.png`, thumb: `before/${id}.webp` },
    diff: { ratio: 0, file: null },
    status: "same",
    accepted: null,
    ...over,
  };
};

const manifest = {
  format: "ljos-shots",
  version: 1,
  repository: "hal-c2/ljos-web",
  sha,
  date: "2026-11-20T14:05:00Z",
  threshold: 0.002,
  previous: { sha: before, date: "2026-11-19T09:30:00Z" },
  gone: [],
  declared: [],
  shots: [
    shot("shell-default.solid.dom.light.desktop"),
    shot("shell-default.solid.webgpu.dark.phone", { status: "changed", diff: { ratio: 0.0123, file: "diff/shell-default.solid.webgpu.dark.phone.png" }, moving: [{ x: 0, y: 120, width: 390, height: 300 }] }),
    shot("demo-cockpit.wasm.webgpu.dark.desktop", {
      status: "changed",
      diff: { ratio: 0.31, file: "diff/demo-cockpit.wasm.webgpu.dark.desktop.png" },
      accepted: { reason: "The cockpit's dock moved to the left.", pr: 140 },
    }),
    shot("demo-cockpit.solid.webgl2.light.desktop", { drawnBy: { browser: "chromium", version: "158.0.8127.18", api: "webgl2", adapter: "ANGLE (Google, SwiftShader driver)", kind: "software" }, status: "broken", health: { ok: false, problems: ["blank canvas (1040×607) after 15 s"] }, diff: null }),
    shot("demo-cockpit.wasm.dom.light.phone", { drawnBy: undefined, status: "new", before: null, diff: null }),
  ],
};

// A picture for every file the page asks for, of the size its name says.
function picture(width, height) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([232, 163, 61, 255], i);
  return PNG.sync.write(png);
}
const desk = picture(144, 90);
const phone = picture(39, 84);

async function open(page, given = manifest, answer = given === null ? { status: 404, body: "" } : { json: given }) {
  await page.route("**/screenshots/manifest.json", (route) => route.fulfill(answer));
  await page.route(/\/screenshots\/(now|before|diff)\//, (route) => route.fulfill({ body: route.request().url().includes(".phone.") ? phone : desk, contentType: "image/png" }));
  await page.goto("/screenshots/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
}

const tile = (page, name) => page.getByRole("group", { name, exact: true });

// The address a picture on the page is drawn from: an Image paints its
// picture as the background of the element inside it.
const drawnFrom = (picture) => picture.evaluate((element) => /url\("?(.*?)"?\)/.exec(element.querySelector(".qq-image")?.style.backgroundImage ?? "")?.[1] ?? "");

test("the page says which deploy drew the pictures, the one compared with, and how many changed", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { level: 1, name: "Screenshots" })).toBeVisible();
  const commit = page.getByRole("link", { name: sha.slice(0, 7), exact: true });
  await expect(commit).toHaveAttribute("href", `https://github.com/hal-c2/ljos-web/commit/${sha}`);
  await expect(page.getByText("20 November 2026, 14:05 UTC")).toBeVisible();
  await expect(page.getByRole("link", { name: before.slice(0, 7), exact: true })).toHaveAttribute("href", `https://github.com/hal-c2/ljos-web/commit/${before}`);
  await expect(page.getByText("19 November 2026, 09:30 UTC")).toBeVisible();
  for (const [count, words] of [
    ["5", "pictures"],
    ["2", "changed"],
    ["1", "broken"],
  ])
    await expect(page.getByRole("group", { name: `${count} ${words}` })).toBeVisible();
});

test("each picture stands beside the one before, named by kernel, renderer, scheme and size", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { level: 2, name: "The front page, default shell" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Svala GT" })).toBeVisible();
  const same = tile(page, "The front page, default shell: Solid kernel, light, desktop 1440×900");
  await same.scrollIntoViewIfNeeded();
  await expect(same.getByText("Same as before")).toBeVisible();
  // An item that is not shown keeps its element, so it is hidden, not absent.
  await expect(same.getByText("Its moving part was checked that it drew, not compared.")).toBeHidden();
  const [was, now] = [same.getByRole("img", { name: /^Before/ }), same.getByRole("img", { name: /^Now/ })];
  await expect.poll(() => drawnFrom(was)).toMatch(/\/screenshots\/before\/shell-default\.solid\.dom\.light\.desktop\.webp$/);
  await expect.poll(() => drawnFrom(now)).toMatch(/\/screenshots\/now\/shell-default\.solid\.dom\.light\.desktop\.webp$/);
  // The one before is first, as a reader reads left to right.
  expect((await was.boundingBox()).x).toBeLessThan((await now.boundingBox()).x);
  const fresh = tile(page, "Svala GT: wasm kernel, light, phone 390×844");
  await fresh.scrollIntoViewIfNeeded();
  await expect(fresh.getByText("New: nothing before to compare with")).toBeVisible();
});

test("a changed picture says by how much in words, and its difference is a link away", async ({ page }) => {
  await open(page);
  const changed = tile(page, "The front page, default shell: Solid kernel, WebGPU, dark, phone 390×844");
  await changed.scrollIntoViewIfNeeded();
  await expect(changed.getByText("Changed: 1.2 % of pixels")).toBeVisible();
  await expect(changed.getByRole("link", { name: "Difference" })).toHaveAttribute("href", /\/screenshots\/diff\/shell-default\.solid\.webgpu\.dark\.phone\.png$/);
  // Its canvas turns on its own, so it was checked, not compared.
  await expect(changed.getByText("Its moving part was checked that it drew, not compared.")).toBeVisible();
  const meant = tile(page, "Svala GT: wasm kernel, WebGPU, dark, desktop 1440×900");
  await expect(meant.getByText("Changed: 31 % of pixels")).toBeVisible();
  await expect(meant.getByText("Intended: The cockpit's dock moved to the left.")).toBeVisible();
  await expect(meant.getByRole("link", { name: "#140" })).toHaveAttribute("href", "https://github.com/hal-c2/ljos-web/pull/140");
  const broken = tile(page, "Svala GT: Solid kernel, WebGL 2, light, desktop 1440×900");
  await expect(broken.getByText("Broken: blank canvas (1040×607) after 15 s")).toBeVisible();
});

test("Changed shows only what changed, and All shows everything again", async ({ page }) => {
  await open(page);
  const changed = page.getByRole("button", { name: "Changed", exact: true });
  const all = page.getByRole("button", { name: "All", exact: true });
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await changed.click();
  await expect(changed).toHaveAttribute("aria-pressed", "true");
  await expect(all).toHaveAttribute("aria-pressed", "false");
  const tiles = page.getByRole("group", { name: /^(The front page, default shell|Svala GT): / });
  await expect(tiles).toHaveCount(2);
  await expect(page.getByText("Same as before")).toHaveCount(0);
  await page.getByRole("button", { name: "Broken", exact: true }).click();
  await expect(tiles).toHaveCount(1);
  await all.click();
  await expect(tiles).toHaveCount(5);
});

test("the chosen filter looks chosen while the pointer is still on it", async ({ page }) => {
  await open(page);
  const fill = (button) => button.evaluate((element) => getComputedStyle(element).backgroundColor);
  const all = page.getByRole("button", { name: "All", exact: true });
  const changed = page.getByRole("button", { name: "Changed", exact: true });
  const chosen = await fill(all);
  expect(await fill(changed)).not.toBe(chosen);
  await changed.click();
  await expect(changed).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => fill(changed), { timeout: 5000 }).toBe(chosen);
});

test("a picture opens full size, links to the image, and Escape gives the keyboard back", async ({ page }) => {
  await open(page);
  const changed = tile(page, "The front page, default shell: Solid kernel, WebGPU, dark, phone 390×844");
  const full = changed.getByRole("button", { name: "Full size" });
  await full.scrollIntoViewIfNeeded();
  await full.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Open the image" })).toHaveAttribute("href", /\/screenshots\/now\/shell-default\.solid\.webgpu\.dark\.phone\.png$/);
  await expect.poll(() => drawnFrom(dialog.getByRole("img"))).toMatch(/\/screenshots\/now\/shell-default\.solid\.webgpu\.dark\.phone\.png$/);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // Ljós sends keys to its own focus item, which is not the document's
  // active element: the button has the keyboard back if Enter presses it.
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Open the image" })).toHaveAttribute("href", /\/screenshots\/now\/shell-default\.solid\.webgpu\.dark\.phone\.png$/);
});

test("Report a bug opens GitHub's form with the picture written in, and files nothing", async ({ page }) => {
  const asked = [];
  await page.route("https://github.com/**", (route) => {
    asked.push(route.request().url());
    return route.abort();
  });
  await open(page);
  const broken = tile(page, "Svala GT: Solid kernel, WebGL 2, light, desktop 1440×900");
  const report = broken.getByRole("link", { name: "Report a bug" });
  const address = new URL(await report.getAttribute("href"));
  expect(`${address.origin}${address.pathname}`).toBe("https://github.com/hal-c2/ljos-web/issues/new");
  expect(address.searchParams.get("title")).toBe("Screenshot: Svala GT, Solid kernel, WebGL 2, light, desktop");
  const body = address.searchParams.get("body");
  const origin = new URL(page.url()).origin;
  for (const line of [
    "Shot: `demo-cockpit.solid.webgl2.light.desktop`",
    `Commit: https://github.com/hal-c2/ljos-web/commit/${sha}`,
    "Renderer: Solid kernel, WebGL 2",
    "Scheme: light",
    `Image: ${origin}/screenshots/now/demo-cockpit.solid.webgl2.light.desktop.png`,
    "Problems: blank canvas (1040×607) after 15 s",
  ])
    expect(body).toContain(line);
  expect(asked).toEqual([]);
});

test("each picture says what drew it, and a software adapter never passes for a GPU", async ({ page }) => {
  await open(page);
  const real = tile(page, "The front page, default shell: Solid kernel, WebGPU, dark, phone 390×844");
  await expect(real.getByText("Chromium 158.0.8127.18, WebGPU on amd rdna-3")).toBeVisible();
  await expect(real.getByText("Software adapter, not a GPU.")).toBeHidden();
  const software = tile(page, "Svala GT: Solid kernel, WebGL 2, light, desktop 1440×900");
  await expect(software.getByText("Chromium 158.0.8127.18, WebGL 2 on ANGLE (Google, SwiftShader driver)")).toBeVisible();
  await expect(software.getByText("Software adapter, not a GPU.")).toBeVisible();
  const unsaid = tile(page, "Svala GT: wasm kernel, light, phone 390×844");
  await expect(unsaid.getByText("Adapter not known: not counted as a GPU.")).toBeVisible();
  await expect(page.getByText("Not drawn on a known GPU: 2 of 5 pictures.")).toBeVisible();
  const body = new URL(await software.getByRole("link", { name: "Report a bug" }).getAttribute("href")).searchParams.get("body");
  expect(body).toContain("Browser: Chromium 158.0.8127.18");
  expect(body).toContain("Adapter: ANGLE (Google, SwiftShader driver) (software, not a GPU)");
});

test("pictures taken off on purpose say why, once for each reason", async ({ page }) => {
  const gone = ["demo-old.solid.webgpu.light.desktop", "demo-old.solid.dom.light.desktop"];
  await open(page, { ...manifest, gone, removed: [{ reason: "The old demo was taken off.", pr: 152, ids: gone }] });
  await expect(page.getByText("Intended: The old demo was taken off.")).toHaveCount(1);
  await expect(page.getByText("Intended: The old demo was taken off.")).toBeVisible();
  await expect(page.getByRole("link", { name: "#152", exact: true })).toHaveAttribute("href", "https://github.com/hal-c2/ljos-web/pull/152");
});

test("a deploy with no pictures says so", async ({ page }) => {
  await open(page, null);
  await expect(page.getByText("No pictures here yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Changed", exact: true })).toHaveCount(0);
});

const [first, second] = manifest.shots;
for (const [what, field, answer] of [
  ["of another format", "format", { json: { ...manifest, format: "other" } }],
  ["of another version", "version", { json: { ...manifest, version: 2 } }],
  ["without a required part", "shots[1].viewport.width", { json: { ...manifest, shots: [first, { ...second, viewport: { ...second.viewport, width: undefined } }] } }],
  ["with a part of the wrong type", "shots[1].health.ok", { json: { ...manifest, shots: [first, { ...second, health: { ok: "yes", problems: [] } }] } }],
  ["with a bad item in a list", "shots[0].health.problems[1]", { json: { ...manifest, shots: [{ ...first, health: { ok: false, problems: ["blank", 7] } }] } }],
  ["with a bad optional part", "shots[0].diff.file", { json: { ...manifest, shots: [{ ...first, diff: { ratio: 0, file: 7 } }] } }],
  ["with two bad parts", "repository", { json: { ...manifest, repository: 7, shots: {} } }],
  ["that is not JSON", "manifest.json", { body: "{", contentType: "application/json" }],
  ["that is JSON null", "manifest.json", { body: "null", contentType: "application/json" }],
  ["that is not served", "manifest.json (HTTP 500)", { status: 500, body: "" }],
])
  test(`a list ${what} says it can't be read, and names ${field}`, async ({ page }) => {
    await open(page, manifest, answer);
    await expect(page.getByText("The list of pictures can't be read.", { exact: true })).toBeVisible();
    await expect(page.getByText(`This is a fault, not a deploy without pictures. The first part that can't be read: ${field}`, { exact: true })).toBeVisible();
    await expect(page.getByText("No pictures here yet.")).toBeHidden();
    await expect(page.getByRole("button", { name: "Changed", exact: true })).toHaveCount(0);
  });

// Between them the two lists have a null in every part that may be absent.
for (const [what, withNull] of [
  ["a whole optional part", { ...manifest, previous: null, removed: null, shots: [{ ...first, gpu: null, moving: null, drawnBy: null, before: null, diff: null, accepted: null }] }],
  [
    "a part inside an optional part",
    {
      ...manifest,
      gone: ["demo-old.solid.dom.light.desktop"],
      removed: [{ reason: "The old demo was taken off.", pr: null, ids: ["demo-old.solid.dom.light.desktop"] }],
      shots: [{ ...first, status: "changed", drawnBy: { ...first.drawnBy, api: null }, diff: { ratio: 0.1, file: null }, accepted: { reason: "It moved.", pr: null } }],
    },
  ],
])
  test(`null and absent look the same, for ${what}`, async ({ page }) => {
    const leftOut = JSON.parse(JSON.stringify(withNull, (_, value) => value ?? undefined));
    const drawn = [];
    for (const given of [withNull, leftOut]) {
      await open(page, given);
      const only = tile(page, "The front page, default shell: Solid kernel, light, desktop 1440×900");
      await only.scrollIntoViewIfNeeded();
      await expect(only).toBeVisible();
      drawn.push({
        words: await page.locator("#app").innerText(),
        pictures: await only.getByRole("img").evaluateAll((all) => all.map((image) => image.getAttribute("aria-label"))),
        links: await page.locator("#app a:visible").evaluateAll((all) => all.map((link) => link.getAttribute("href"))),
      });
    }
    expect(drawn[1]).toEqual(drawn[0]);
  });

const axe = createRequire(import.meta.resolve("@axe-core/playwright"))("axe-core");

for (const scheme of ["light", "dark"])
  for (const [size, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["phone", { width: 390, height: 844 }],
  ])
    test(`in ${scheme} at ${viewport.width} wide nothing runs past the window, and every text meets AA contrast`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, colorScheme: scheme, reducedMotion: "no-preference" });
      const page = await context.newPage();
      await open(page);
      await expect(page.getByRole("group", { name: /^(The front page|Svala GT): / }).first()).toBeVisible();
      const past = await page.evaluate(() =>
        [...document.querySelectorAll("#app *")]
          .filter((element) => element.children.length === 0 && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden")
          .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
          .map((element) => `${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim().slice(0, 40)}" ends at ${Math.round(element.getBoundingClientRect().right)}`),
      );
      expect(past, `${size}: what runs past the window`).toEqual([]);
      const { violations } = await new AxeBuilder({ page, axeSource: axe.source }).withRules(["color-contrast"]).analyze();
      expect(violations.flatMap(({ nodes }) => nodes.map((node) => `${node.target.join(" ")}: ${node.failureSummary}`))).toEqual([]);
      await context.close();
    });
