// Hydration takes over what a prerender wrote, page by page: pages
// hydrated at once each take their own elements over and settle on
// their own rounds, a page mounted beside them or into a detached
// element makes its own, what a part's completion makes as the page
// settles is taken over once, what a page's own script makes meanwhile
// is new, and a page that throws as it is made leaves the document
// making its own elements again.
import { expect, test } from "@playwright/test";

const open = async (page) => {
  const warnings = [];
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type())) warnings.push(message.text());
  });
  page.on("pageerror", (error) => warnings.push(error.message));
  await page.goto("/hydrate.html");
  await page.waitForFunction(() => window.ready);
  return warnings;
};

test("two pages hydrated at once each take their own over, and neither ends the other's", async ({ page }) => {
  const warnings = await open(page);
  const taken = await page.evaluate(async () => {
    const [one, two] = [document.getElementById("one"), document.getElementById("two")];
    const written = [await prerender(one), await prerender(two)];
    const before = [[...one.querySelectorAll("[data-hk]")], [...two.querySelectorAll("[data-hk]")]];
    // The second is hydrated while the first is still settling: both
    // put their ShellLoader's fallback in in the rounds that follow.
    const first = hydrate(Page, one);
    const second = hydrate(Page, two);
    await Promise.all([first.hydrated, second.hydrated]);
    return {
      written,
      kept: [before[0].filter((element) => one.contains(element)).length, before[1].filter((element) => two.contains(element)).length],
      unclaimed: document.querySelectorAll("[data-hk]").length,
      settled: [one, two].map((host) => host.textContent.includes("Made as the page settles")),
      hydrated: [one.dataset.ljosHydrated, two.dataset.ljosHydrated],
      answering: Object.hasOwn(document, "createElement") || Object.hasOwn(document, "createElementNS"),
    };
  });
  // Each written page has its root's elements and the fallback's.
  expect(taken.written[0]).toBeGreaterThan(5);
  expect(taken).toEqual({
    written: [taken.written[0], taken.written[0]],
    kept: taken.written,
    unclaimed: 0,
    settled: [true, true],
    hydrated: ["true", "true"],
    answering: false,
  });
  expect(warnings).toEqual([]);
});

test("a page mounted beside one still hydrating makes its own elements", async ({ page }) => {
  const warnings = await open(page);
  const taken = await page.evaluate(async () => {
    const [one, beside] = [document.getElementById("one"), document.getElementById("beside")];
    const written = await prerender(one);
    const before = [...one.querySelectorAll("[data-hk]")];
    const hydrating = hydrate(Page, one);
    mount(Page, beside);
    await hydrating.hydrated;
    return {
      written,
      kept: before.filter((element) => one.contains(element)).length,
      moved: before.filter((element) => beside.contains(element)).length,
      beside: beside.textContent.includes("Made as the page settles"),
    };
  });
  expect(taken).toEqual({ written: taken.written, kept: taken.written, moved: 0, beside: true });
  expect(warnings).toEqual([]);
});

test("pages hydrated at once into elements not in the document each take their own over", async ({ page }) => {
  const warnings = await open(page);
  const taken = await page.evaluate(async () => {
    const hosts = [document.createElement("div"), document.createElement("div")];
    const written = [await prerender(hosts[0]), await prerender(hosts[1])];
    const before = hosts.map((host) => [...host.querySelectorAll("[data-hk]")]);
    const hydrating = hosts.map((host) => hydrate(Page, host));
    await Promise.all(hydrating.map((one) => one.hydrated));
    return {
      written,
      kept: before.map((elements, at) => elements.filter((element) => hosts[at].contains(element)).length),
      unclaimed: hosts.map((host) => host.querySelectorAll("[data-hk]").length),
      settled: hosts.map((host) => host.textContent.includes("Made as the page settles")),
    };
  });
  expect(taken).toEqual({ written: taken.written, kept: taken.written, unclaimed: [0, 0], settled: [true, true] });
  expect(warnings).toEqual([]);
});

test("a page mounted into a detached element while one hydrates makes its own elements", async ({ page }) => {
  const warnings = await open(page);
  const taken = await page.evaluate(async () => {
    const one = document.getElementById("one");
    const detached = document.createElement("div");
    const written = await prerender(one);
    const before = [...one.querySelectorAll("[data-hk]")];
    // Measured off the page, or built before it is put in, and mounted
    // just before the page is hydrated: its ShellLoader's fallback is
    // made first, in the rounds the hydrating page settles in.
    mount(Page, detached);
    const hydrating = hydrate(Page, one);
    await hydrating.hydrated;
    return {
      written,
      kept: before.filter((element) => one.contains(element)).length,
      moved: before.filter((element) => detached.contains(element)).length,
      unclaimed: document.querySelectorAll("[data-hk]").length,
      settled: [one, detached].map((host) => host.textContent.includes("Made as the page settles")),
    };
  });
  expect(taken).toEqual({ written: taken.written, kept: taken.written, moved: 0, unclaimed: 0, settled: [true, true] });
  expect(warnings).toEqual([]);
});

test("what a part's Component.onCompleted makes as the page settles is taken over, once", async ({ page }) => {
  const warnings = await open(page);
  const taken = await page.evaluate(async () => {
    const [one, fresh] = [document.getElementById("one"), document.getElementById("two")];
    const written = await prerender(one, Completing);
    const before = [...one.querySelectorAll("[data-hk]")];
    // The child the completion appended, numbered as the prerender made it.
    const added = [...one.querySelectorAll('[data-hk$=":Rectangle"]')].filter((element) => element.textContent.includes("Added on completion")).at(-1) ?? null;
    await hydrate(Completing, one).hydrated;
    // A page made fresh, for what the hydrated one should be.
    mount(Completing, fresh);
    await new Promise((done) => setTimeout(done));
    const shape = (host) => [...host.querySelectorAll("*")].map((element) => element.localName);
    return {
      written,
      kept: before.filter((element) => one.contains(element)).length,
      unclaimed: document.querySelectorAll("[data-hk]").length,
      added: one.textContent.split("Added on completion").length - 1,
      sameChild: added !== null && one.contains(added) && added.textContent.includes("Added on completion"),
      completed: one.textContent.includes("Completed, and a child added") && !one.textContent.includes("Before it completes"),
      shape: shape(one).join(" ") === shape(fresh).join(" "),
    };
  });
  expect(taken.written).toBeGreaterThan(5);
  expect(taken).toEqual({ written: taken.written, kept: taken.written, unclaimed: 0, added: 1, sameChild: true, completed: true, shape: true });
  expect(warnings).toEqual([]);
});

test("what a page's own script makes while a page hydrates is new: every prerendered element stays the page's", async ({ page }) => {
  const warnings = await open(page);
  const taken = await page.evaluate(async () => {
    const one = document.getElementById("one");
    const written = await prerender(one);
    const before = [...one.querySelectorAll("[data-hk]")];
    const stray = [];
    // Made outside any type's setup, in the rounds the page settles
    // in: one queued before it is hydrated, one queued later.
    queueMicrotask(() => stray.push(document.createElement("div")));
    const hydrating = hydrate(Page, one);
    queueMicrotask(() => queueMicrotask(() => stray.push(document.createElement("div"))));
    await hydrating.hydrated;
    return {
      kept: before.filter((element) => one.contains(element)).length,
      written,
      stray: stray.map((element) => before.includes(element) || element.isConnected),
    };
  });
  expect(taken).toEqual({ kept: taken.written, written: taken.written, stray: [false, false] });
  expect(warnings).toEqual([]);
});

test("a page that throws as it is made leaves the document making its own elements", async ({ page }) => {
  await open(page);
  const after = await page.evaluate(async () => {
    const one = document.getElementById("one");
    await prerender(one);
    let thrown = null;
    try {
      hydrate(() => {
        throw new Error("made wrong");
      }, one);
    } catch (error) {
      thrown = error.message;
    }
    const div = document.createElement("div");
    return {
      thrown,
      answering: Object.hasOwn(document, "createElement") || Object.hasOwn(document, "createElementNS"),
      fresh: !div.hasAttribute("data-hk") && !div.isConnected,
    };
  });
  expect(after).toEqual({ thrown: "made wrong", answering: false, fresh: true });
});
