// What a Controller's module throws is reported as a handler's throw is, and
// nothing else stops for it; `updated` reaches a listener connected after
// the Controller was attached; and a gesture destroyed is detached, and
// stops acting, as a Controller destroyed is.
import { expect, open, test } from "./open.js";

test.use({ told: [/thrown in (attached|updated|detached)/] });

const log = (page) => page.evaluate(() => window.objects.log.splice(0));
const settle = (page) => page.evaluate(() => new Promise((done) => setTimeout(done, 20)));
const write = (page, width) =>
  page.evaluate((width) => {
    window.objects.root.width = width;
    window.flush();
  }, width);

test("a module's attached that throws is reported, and what comes after it is attached", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  await open(page, "controllerfaults");
  expect(await log(page)).toContain("after attached");
  expect(await page.evaluate(() => window.objects.root.width)).toBe(200);
  expect(errors.some((error) => error.includes("thrown in attached"))).toBe(true);
});

test("a module's updated that throws is updated again the next turn", async ({ page }) => {
  await open(page, "controllerfaults");
  await settle(page);
  expect(await page.evaluate(() => window.objects.updates)).toBe(1);
  await write(page, 300);
  await settle(page);
  expect(await page.evaluate(() => window.objects.updates)).toBe(2);
});

test("a module's detached that throws is reported, and the Controller is still detached once", async ({ page }) => {
  await open(page, "controllerfaults");
  await page.evaluate(() => window.objects.throws.destroy());
  await settle(page);
  await write(page, 300);
  await settle(page);
  expect(await page.evaluate(() => window.objects.updates)).toBe(1);
});

test("a listener connected to updated after the Controller was attached is told", async ({ page }) => {
  await open(page, "controllerfaults");
  await settle(page);
  await page.evaluate(() => {
    window.objects.heard = [];
    window.objects.late.updated.connect(() => window.objects.heard.push(window.objects.root.width));
  });
  await write(page, 300);
  await settle(page);
  expect(await page.evaluate(() => window.objects.heard)).toEqual([300]);
});

test("a gesture destroyed is detached once, and taps no more", async ({ page }) => {
  await open(page, "controllerfaults");
  await log(page);
  const box = await page.evaluate(() => {
    const { x, y } = window.objects.root.$node.getBoundingClientRect();
    return { x, y };
  });
  await page.mouse.click(box.x + 50, box.y + 20);
  await expect.poll(() => page.evaluate(() => window.objects.taps)).toBe(1);
  await page.evaluate(() => window.objects.tap.destroy());
  await settle(page);
  expect(await log(page)).toEqual(["tap detached"]);
  await page.mouse.click(box.x + 50, box.y + 20);
  await settle(page);
  expect(await page.evaluate(() => window.objects.taps)).toBe(1);
});

test("once its last listener is disconnected, a turn that writes the host asks nothing of the Controller", async ({ page }) => {
  await open(page, "controllerfaults");
  await settle(page);
  const armed = await page.evaluate(() => {
    const { late, root } = window.objects;
    const told = () => {};
    late.updated.connect(told);
    late.updated.disconnect(told);
    root.width = 300;
    window.flush();
    // What a write asks of it is a microtask at the turn's end, queued as
    // the write is made.
    return late.$life.armed;
  });
  expect(armed).toBe(false);
});
