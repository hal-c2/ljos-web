// `Controller` (Ljos.Core): behaviour an item is given by declaring it
// inside, as ljos-ui's `features/components/controller.feature` has it.
// Its host is the item it is declared in; it is attached once the host is
// complete, updated once a batch that wrote the host, and detached once.
import { expect, open, test } from "./open.js";

const log = (page) => page.evaluate(() => window.objects.log.splice(0));

test("a Controller's host is its item, and it is attached once the item is complete", async ({ page }) => {
  await open(page, "controller");
  const told = await log(page);
  // Attached after the host's own `Component.onCompleted`: `ready` is 1.
  expect(told).toContain("attached true 1");
  expect(await page.evaluate(() => window.objects.outer.host === window.objects.root)).toBe(true);
});

test("a Controller inside a Controller shares its host", async ({ page }) => {
  await open(page, "controller");
  expect(await log(page)).toContain("inner true");
  expect(await page.evaluate(() => window.objects.inner.host === window.objects.root)).toBe(true);
});

test("updated runs once after attached, and once a turn that wrote the host", async ({ page }) => {
  await open(page, "controller");
  expect((await log(page)).filter((told) => told === "updated")).toEqual(["updated"]);
  // Two writes in one turn are one update; what `updated` wrote itself
  // (`seen`) does not update it again.
  await page.evaluate(() => {
    window.objects.root.width = 300;
    window.objects.root.height = 120;
    window.flush();
  });
  await page.evaluate(() => new Promise((done) => setTimeout(done, 20)));
  expect((await log(page)).filter((told) => told === "updated")).toEqual(["updated"]);
  expect(await page.evaluate(() => window.objects.root.seen)).toBe(2);
  // Nothing more is asked of it while nothing is written.
  await page.evaluate(() => new Promise((done) => setTimeout(done, 50)));
  expect(await log(page)).toEqual([]);
});

test("a binding that gives the host something new updates it, as a write does", async ({ page }) => {
  await open(page, "controller");
  expect((await log(page)).filter((told) => told.startsWith("following"))).toEqual(["following 100"]);
  await page.evaluate(() => {
    window.objects.root.width = 300;
    window.flush();
  });
  await page.evaluate(() => new Promise((done) => setTimeout(done, 20)));
  expect((await log(page)).filter((told) => told.startsWith("following"))).toEqual(["following 150"]);
});

test("a host whose anchors give it a new size updates it", async ({ page }) => {
  await open(page, "controller");
  expect((await log(page)).filter((told) => told.startsWith("fitted"))).toEqual(["fitted 200"]);
  await page.evaluate(() => {
    window.objects.root.width = 300;
    window.flush();
  });
  await page.evaluate(() => new Promise((done) => setTimeout(done, 20)));
  expect((await log(page)).filter((told) => told.startsWith("fitted"))).toEqual(["fitted 300"]);
});

test("a Controller destroyed is detached once", async ({ page }) => {
  await open(page, "controller");
  await log(page);
  await page.evaluate(() => window.objects.outer.destroy());
  await page.evaluate(() => new Promise((done) => setTimeout(done, 20)));
  expect(await log(page)).toEqual(["outer detached"]);
});

test("a Controller in what a Loader unloads is detached", async ({ page }) => {
  await open(page, "controller");
  expect(await log(page)).toContain("loaded attached");
  await page.evaluate(() => {
    window.objects.loader.active = false;
    window.flush();
  });
  expect(await log(page)).toEqual(["loaded detached"]);
});

test.describe("a Controller written as a module", () => {
  test("its bindings read the host, and what attached returned runs as it is detached", async ({ page }) => {
    await open(page, "controller");
    expect(await log(page)).toContain("breakpoint attached");
    expect(await page.evaluate(() => window.objects.wide.wide)).toBe(true);
    await page.evaluate(() => {
      window.objects.root.width = 100;
      window.flush();
    });
    expect(await page.evaluate(() => window.objects.wide.wide)).toBe(false);
    await page.evaluate(() => window.objects.wide.destroy());
    await page.evaluate(() => new Promise((done) => setTimeout(done, 20)));
    expect((await log(page)).filter((told) => told.startsWith("breakpoint"))).toEqual(["breakpoint cleanup", "breakpoint detached"]);
  });

  test("a member a controller has not is an error that names those it has", async ({ page }) => {
    await open(page, "controller");
    const said = await page.evaluate(() => {
      try {
        window.objects.controller({ started() {} });
        return null;
      } catch (error) {
        return `${error.name}: ${error.message}`;
      }
    });
    expect(said).toBe(
      "TypeError: a controller has `properties`, `bindings`, `attached`, `detached` and `updated`; `started` is none of them",
    );
  });
});

test.describe("the gestures are Controllers", () => {
  test("a Tap's host is its item, and it is attached to it", async ({ page }) => {
    await open(page, "controller");
    expect(await log(page)).toContain("tap true");
    expect(await page.evaluate(() => window.objects.tap.host === window.objects.root)).toBe(true);
  });

  test("a Tap in a Controller acts on the Controller's host", async ({ page }) => {
    await open(page, "controller");
    const box = await page.evaluate(() => {
      const { x, y } = window.objects.root.$node.getBoundingClientRect();
      return { x, y };
    });
    await page.mouse.click(box.x + 50, box.y + 20);
    await page.evaluate(() => window.flush());
    expect(await page.evaluate(() => window.objects.taps)).toBe(1);
  });
});
