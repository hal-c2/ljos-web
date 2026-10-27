// The Rust `Counter`, bound from QML in a real browser: a click calls
// into wasm, and the text and the handlers follow what comes back.
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") problems.push(message.text());
  });
  page.problems = problems;
  await page.goto("/");
  await page.waitForFunction(() => window.ready);
});

test.afterEach(async ({ page }) => {
  expect(page.problems).toEqual([]);
});

const read = (page) => page.evaluate(() => window.scene.read());

test("binds the wasm counter's count", async ({ page }) => {
  // [count, step, bumps, lastBump, countChanges, the Text's text]
  expect(await read(page)).toEqual([0, 2, 0, -1, 0, "Count: 0"]);
  await expect(page.getByText("Count: 0")).toBeVisible();
});

test("a click increments in Rust, and the signal carries the count", async ({ page }) => {
  for (const count of [2, 4, 6]) {
    await page.mouse.click(200, 150);
    await expect(page.getByText(`Count: ${count}`)).toBeVisible();
    expect(await read(page)).toEqual([count, 2, count / 2, count, count / 2, `Count: ${count}`]);
  }
  await expect(page.getByText("Bumped: 6")).toBeVisible();
});

test("a step written from QML is the step Rust counts by", async ({ page }) => {
  await page.evaluate(() => window.scene.setStep(5));
  await page.mouse.click(200, 150);
  await expect(page.getByText("Count: 5")).toBeVisible();
  expect(await read(page)).toEqual([5, 5, 1, 5, 1, "Count: 5"]);
});

test("measures a click's way to the page and a call's across", async ({ page }) => {
  // Both ends timed in the page: a capture listener sees the release
  // before the runtime's own handler does, and an observer sees the
  // words change. What is between them is the runtime's hit test, the
  // call into Rust, the telling back, Solid's flush and the DOM write.
  await page.evaluate(() => {
    const marks = (window.marks = { released: [], changed: [] });
    document.addEventListener("pointerup", () => marks.released.push(performance.now()), true);
    new MutationObserver(() => marks.changed.push(performance.now())).observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  for (let i = 0; i < 30; i++) {
    await page.mouse.click(200, 150);
    await page.waitForFunction((count) => window.marks.changed.length > count, i);
  }
  const measured = await page.evaluate(() => {
    const clicks = window.marks.changed.map((changed, index) => changed - window.marks.released[index]);
    clicks.sort((a, b) => a - b);
    // One call across and back, with nobody watching the count: the
    // boundary's own price, separate from Solid's and the DOM's.
    const counter = new window.RustCounter();
    const began = performance.now();
    for (let i = 0; i < 10000; i++) counter.increment();
    const each = ((performance.now() - began) / 10000) * 1000;
    return { median: clicks[15], worst: clicks[29], each, count: counter.count };
  });
  expect(measured.count).toBe(10000);
  console.log(`click to DOM: median ${measured.median.toFixed(3)} ms, worst ${measured.worst.toFixed(3)} ms; one increment across: ${measured.each.toFixed(3)} µs`);
  expect(measured.median).toBeLessThan(16);
});
