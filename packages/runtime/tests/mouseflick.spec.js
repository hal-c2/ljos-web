// A Flickable dragged and thrown with a mouse, which the browser leaves to
// the page. What is expected is what Qt 6.11 does with the same scene and
// the same moves.
import { expect, open, test } from "./open.js";

const said = (page) => page.evaluate(() => window.scene.said());
const at = (page, name = "flickable") => page.evaluate((name) => window.scene[name].contentY, name);
const moving = (page, name = "flickable") => page.evaluate((name) => window.scene[name].moving, name);

// A drag down a column, a step at a time: where the content is after each.
async function drag(page, x, from, to, steps, wait, release = true) {
  const seen = [];
  await page.mouse.move(x, from);
  await page.mouse.down();
  for (let step = 1; step <= steps; step++) {
    if (wait) await page.waitForTimeout(wait);
    await page.mouse.move(x, from + ((to - from) * step) / steps);
    seen.push(await at(page));
  }
  if (release) {
    if (wait) await page.waitForTimeout(wait);
    await page.mouse.up();
  }
  return seen;
}

test("a mouse drags the content once it has gone far enough", async ({ page }) => {
  await open(page, "mouseflick");
  await page.mouse.move(50, 200);
  await page.mouse.down();
  expect(await said(page)).toEqual(["m pressed"]);
  // Up to the threshold, and the first move past it, nothing moves.
  await page.mouse.move(50, 190);
  await page.mouse.move(50, 180);
  expect(await said(page)).toEqual([]);
  // The next takes the press from what had it, and the content moves by
  // what the mouse moves from here.
  await page.mouse.move(50, 170);
  expect(await said(page)).toEqual(["dragStarted 0", "movementStarted", "m canceled"]);
  expect(await page.evaluate(() => [window.scene.flickable.dragging, window.scene.flickable.draggingVertically])).toEqual([true, true]);
  expect(await at(page)).toBe(0);
  await page.mouse.move(50, 160);
  expect(await at(page)).toBe(10);
  await page.mouse.move(50, 100);
  expect(await at(page)).toBe(70);
  // It goes no further than there is content.
  await page.mouse.move(50, 290);
  expect(await at(page)).toBe(0);
  // A mouse that rested before it was let go has not thrown it.
  await page.mouse.move(50, 100);
  await page.waitForTimeout(150);
  await page.mouse.up();
  expect(await said(page)).toEqual(["dragEnded 70", "movementEnded"]);
  expect(await page.evaluate(() => [window.scene.flickable.dragging, window.scene.flickable.moving])).toEqual([false, false]);
  expect(await at(page)).toBe(70);
});

test("a mouse let go while it moves throws the content on", async ({ page }) => {
  await open(page, "mouseflick");
  // A hundred pixels in six tenths of a second.
  expect(await drag(page, 50, 200, 100, 10, 60)).toEqual([0, 0, 0, 10, 20, 30, 40, 50, 60, 70]);
  expect(await said(page)).toEqual(["m pressed", "dragStarted 0", "movementStarted", "m canceled", "dragEnded 70", "flickStarted"]);
  await expect.poll(() => moving(page)).toBe(false);
  expect(await said(page)).toEqual(["flickEnded", "movementEnded"]);
  // Qt, at 167 pixels a second: 79.
  const rest = await at(page);
  expect(rest).toBeGreaterThan(73);
  expect(rest).toBeLessThan(90);
  // And as fast as it will be thrown, all the way.
  await drag(page, 50, 250, 50, 5, 0);
  await expect.poll(() => moving(page)).toBe(false);
  expect(await at(page)).toBe(700);
});

test("a press that does not go far is the press of what is in it", async ({ page }) => {
  await open(page, "mouseflick");
  expect(await drag(page, 50, 200, 195, 5, 0)).toEqual([0, 0, 0, 0, 0]);
  expect(await said(page)).toEqual(["m pressed", "m released", "m clicked"]);
});

test("a press in a Flickable is not one for what is behind it", async ({ page }) => {
  await open(page, "mouseflick");
  await page.mouse.click(250, 150);
  expect(await said(page)).toEqual([]);
  await drag(page, 250, 200, 100, 10, 0, false);
  expect(await at(page, "plain")).toBe(70);
  await page.waitForTimeout(150);
  await page.mouse.up();
  // Nor does the drag select the text it went over.
  expect(await page.evaluate(() => String(getSelection()))).toBe("");
});

test("a mouse does not drag what a ScrollView scrolls", async ({ page }) => {
  await open(page, "mouseflick");
  await drag(page, 150, 200, 100, 10, 0);
  expect(await page.evaluate(() => window.scene.scrolled.contentItem.contentY)).toBe(0);
});

// Qt 6.9's `acceptedButtons`: the buttons a mouse drags the content with.
// With none, a mouse drag is the press of what is in it all the way, and
// the content still scrolls by the wheel (a page that scrolls as a web
// page does: wheel, bars and touch, not mouse drags).
test("a Flickable that accepts no button is not dragged by a mouse, and the wheel still scrolls it", async ({ page }) => {
  await open(page, "mouseflick");
  expect(await page.evaluate(() => window.scene.flickable.acceptedButtons)).toBe(1);
  await page.evaluate(() => (window.scene.flickable.acceptedButtons = 0));
  expect(await drag(page, 50, 200, 100, 10, 0)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const told = await said(page);
  expect(told).toContain("m pressed");
  expect(told).toContain("m released");
  expect(told).not.toContain("m canceled");
  expect(told.some((line) => /^dragStarted|^movementStarted/.test(line))).toBe(false);
  await page.mouse.move(50, 150);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => at(page)).toBeGreaterThan(0);
});

// A drag along the list, twenty pixels at a time.
async function swipe(page, from, to, rest) {
  await page.mouse.move(from, 50);
  await page.mouse.down();
  for (let x = from; x !== to; ) await page.mouse.move((x += Math.sign(to - from) * 20), 50);
  if (rest) await page.waitForTimeout(150);
  await page.mouse.up();
}

test("a list that goes an item at a time comes to rest on one", async ({ page }) => {
  await open(page, "mouseflick");
  const x = () => page.evaluate(() => window.scene.list.contentX);
  const rested = async () => {
    await expect.poll(() => moving(page, "list")).toBe(false);
    return [await x(), await said(page)];
  };
  // Held, it is where the mouse has it.
  await page.mouse.move(390, 50);
  await page.mouse.down();
  for (const to of [370, 350, 330, 310]) await page.mouse.move(to, 50);
  expect(await x()).toBe(40);
  // Let go of at rest, having gone far enough, it goes on to the next.
  await page.waitForTimeout(150);
  await page.mouse.up();
  expect(await rested()).toEqual([100, ["dragStarted 0", "movementStarted", "dragEnded 40", "movementEnded"]]);
  // Thrown, it goes one on however far it would have gone.
  await swipe(page, 390, 310, false);
  expect(await rested()).toEqual([200, ["dragStarted 100", "movementStarted", "dragEnded 140", "flickStarted", "flickEnded", "movementEnded"]]);
  await swipe(page, 390, 190, false);
  expect((await rested())[0]).toBe(400);
  // And back.
  await swipe(page, 310, 390, false);
  expect((await rested())[0]).toBe(300);
  // Not far enough, it goes back to where it was.
  await swipe(page, 390, 330, true);
  expect((await rested())[0]).toBe(300);
});
