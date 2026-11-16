import { expect, open, test } from "./open.js";
import { pixels } from "./pixels.js";

const RED = "255 0 0";
// What Qt paints a scene's `#204060` as, measured in a View3D: the colour
// goes to the screen by way of the scene's light, and comes back a little
// off.
const SKY = "30 64 96";

test("a scene for a headset is seen from where the head would be", async ({ page }) => {
  await open(page, "xr");
  const read = () => page.evaluate(() => window.scene.read());
  // What the scene is seen in is as big as what it was mounted in.
  const { width, height } = await page.evaluate(() => {
    const canvas = document.querySelector("#scene canvas");
    return { width: canvas.clientWidth, height: canvas.clientHeight, host: document.getElementById("scene").clientWidth };
  });
  expect(width).toBeGreaterThan(100);
  expect(height).toBeGreaterThan(100);
  const middle = [Math.round(width / 2), Math.round(height / 2)];
  const corner = [10, 10];

  // A space that begins at the floor has the head at eye height, and what
  // the origin's `camera` holds is in the origin. Qt's numbers for the enums.
  expect(await read()).toEqual({
    head: [0, 160, 0],
    parent: true,
    failures: 0,
    enums: [3, 1, 1, -1, 12, 28, 30],
    hand: [0, 1, false],
    action: [0, false, true, [12, 11]],
    origin: [0, 0, 0],
    children: [true, true],
    hit: null,
    held: [true, true, false, false],
  });
  await expect.poll(async () => await pixels(page, [middle, corner])).toEqual([RED, SKY]);

  // Moving the origin moves the head: the cube is no longer straight ahead.
  await page.evaluate(() => window.scene.step(0));
  expect((await read()).head).toEqual([100, 160, 50]);
  await expect.poll(async () => await pixels(page, [middle, corner])).toEqual([SKY, SKY]);

  // A space that begins where the head was has it at the origin.
  await page.evaluate(() => window.scene.step(1));
  expect((await read()).head).toEqual([0, 0, 0]);
  await expect.poll(async () => await pixels(page, [middle, corner])).toEqual([SKY, SKY]);
  await page.evaluate(() => window.scene.step(2));
  await expect.poll(async () => await pixels(page, [middle, corner])).toEqual([RED, SKY]);

  // A camera the origin lets go of is nowhere, and is its own again when
  // the origin holds it again. The spare looks away from the cube.
  await page.evaluate(() => window.scene.step(3));
  expect((await read()).held).toEqual([false, false, true, true]);
  await expect.poll(async () => await pixels(page, [middle, corner])).toEqual([SKY, SKY]);
  await page.evaluate(() => window.scene.step(4));
  expect((await read()).held).toEqual([true, true, false, false]);
  await expect.poll(async () => await pixels(page, [middle, corner])).toEqual([RED, SKY]);

  // One whose parent the program has since said is the origin stays its
  // child when the origin lets go of it.
  await page.evaluate(() => window.scene.step(5));
  expect((await read()).held).toEqual([true, true, true, true]);
  await page.evaluate(() => window.scene.step(6));
  expect((await read()).held).toEqual([true, true, false, false]);
  await expect.poll(async () => await pixels(page, [middle, corner])).toEqual([RED, SKY]);
});
