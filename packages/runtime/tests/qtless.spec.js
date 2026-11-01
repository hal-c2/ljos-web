// QtQuick3D.Helpers and QtQuick3D.Effects on a machine with no Qt: what Qt has
// of them as QML is Ljós's (`quick3d/`). The server of this file has no Qt
// on any path (`qtless.config.js`). What is expected is what Qt's documentation
// says of each type, and of a controller what Qt's does when it is run.
import { check } from "../quick3d.js";
import { expect, open, test } from "./open.js";
import { pixels } from "./pixels.js";

const port = Number(process.env.LJOS_WEB_PORT ?? 4174) + 1;
test.use({ baseURL: `http://127.0.0.1:${port}` });

const colour = async (page, point) => (await pixels(page, [point]))[0].split(" ").map(Number);
const near = (read, wanted, slack, what) => read.forEach((value, index) => expect(Math.abs(value - wanted[index]), `${what}: ${read} for ${wanted}`).toBeLessThanOrEqual(slack));
const settled = (page, point, wanted, slack, what) =>
  expect.poll(async () => {
    const read = await colour(page, point);
    return Math.max(...read.map((value, index) => Math.abs(value - wanted[index])));
  }, { message: what }).toBeLessThanOrEqual(slack);

test("the copy of Ljós's QML is what ljos-ui has at the commit it names, or what its change says", () => {
  expect(check()).toEqual([]);
});

test("a drag over an OrbitCameraController turns its origin, and the wheel brings its camera closer", async ({ page }) => {
  await open(page, "qtless3d");
  await page.mouse.move(100, 75);
  await page.mouse.down();
  await page.mouse.move(150, 95, { steps: 10 });
  await page.mouse.up();
  const turned = await page.evaluate(() => {
    const { x, y } = window.objects.orbited.eulerRotation;
    return { x, y };
  });
  // As a running Qt turns it: both ways against the drag, at about 0.14 of a
  // degree to a pixel.
  expect(turned.y).toBeCloseTo(-7, 0);
  expect(turned.x).toBeCloseTo(-2.8, 0);
  await page.mouse.wheel(0, -120);
  await expect.poll(() => page.evaluate(() => window.objects.orbitCamera.z)).toBeCloseTo(428, 3);
  // Near and far follow the distance.
  expect(await page.evaluate(() => window.objects.orbitCamera.clipNear)).toBe(1);
});

test("a drag with Ctrl held moves the origin across the view instead", async ({ page }) => {
  await open(page, "qtless3d");
  await page.keyboard.down("Control");
  await page.mouse.move(100, 75);
  await page.mouse.down();
  await page.mouse.move(150, 75, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Control");
  const after = await page.evaluate(() => {
    const { position, eulerRotation } = window.objects.orbited;
    return { x: position.x, turned: eulerRotation.y };
  });
  expect(after.x).toBeLessThan(0);
  expect(after.turned).toBe(0);
});

test("two fingers moved together over an OrbitCameraController move its origin, and turn nothing", async ({ page }) => {
  await open(page, "qtless3d");
  const device = await page.context().newCDPSession(page);
  const fingers = (type, at) => device.send("Input.dispatchTouchEvent", { type, touchPoints: at.map(([x, y], id) => ({ x, y, id })) });
  await fingers("touchStart", [[90, 75]]);
  await fingers("touchStart", [[90, 75], [110, 75]]);
  for (const by of [5, 10, 20, 40]) await fingers("touchMove", [[90 + by, 75], [110 + by, 75]]);
  await expect.poll(() => page.evaluate(() => window.objects.orbited.position.x)).toBeLessThan(0);
  await fingers("touchEnd", []);
  expect(await page.evaluate(() => window.objects.orbited.eulerRotation.y)).toBeGreaterThan(-1);
});

test("a key held over a WasdController moves what it controls until it is let go", async ({ page }) => {
  await open(page, "qtless3d");
  await page.mouse.click(300, 75);
  await page.evaluate(() => window.objects.walker.forceActiveFocus());
  const z = () => page.evaluate(() => window.objects.walker.controlledObject.z);
  await page.keyboard.down("w");
  await expect.poll(z).toBeLessThan(299);
  await page.keyboard.up("w");
  const held = await z();
  await page.waitForTimeout(100);
  expect(await z()).toBe(held);
  expect(await page.evaluate(() => window.objects.walker.inputsNeedProcessing)).toBe(false);
});

test("a LodManager shows the child its camera's distance picks", async ({ page }) => {
  await open(page, "qtless3d");
  const shown = () => page.evaluate(() => ["near", "middle", "far"].map((name) => window.objects[name].visible));
  expect(await shown()).toEqual([true, false, false]);
  await page.evaluate(() => (window.objects.lodCamera.z = 500));
  expect(await shown()).toEqual([false, true, false]);
  await page.evaluate(() => (window.objects.lodCamera.z = 5000));
  expect(await shown()).toEqual([false, false, true]);
  // Across a distance two levels share over fadeDistance, centred on it.
  await page.evaluate(() => {
    window.objects.lod.fadeDistance = 100;
    window.objects.lodCamera.z = 425;
  });
  expect(await shown()).toEqual([true, true, false]);
  expect(await page.evaluate(() => [window.objects.near.opacity, window.objects.middle.opacity])).toEqual([0.25, 0.75]);
});

test("an ExtendedSceneEnvironment brings a scene to the screen by what it is set to", async ({ page }) => {
  await open(page, "qtless3d");
  const enums = await page.evaluate(() => window.objects.extended.glowBlendMode);
  expect(enums).toBe(2); // SoftLight, the default Qt's documentation gives.
  await settled(page, [10, 10], [64, 64, 64], 2, "as set");
  await page.evaluate(() => (window.objects.extended.exposure = 2));
  await settled(page, [10, 10], [88, 88, 88], 2, "exposed");
  await page.evaluate(() => {
    window.objects.extended.exposure = 1;
    window.objects.extended.vignetteEnabled = true;
    window.objects.extended.vignetteColor = "black";
  });
  const [corner] = await colour(page, [1, 1]);
  const [middle] = await colour(page, [100, 75]);
  expect(corner).toBeLessThan(middle - 20);
});

test("ColorMaster multiplies each channel, and desaturates", async ({ page }) => {
  await open(page, "qtless3d");
  // Nothing tone maps here: #808080 in linear light is 0.216, 55 of 255.
  await settled(page, [50, 190], [55, 55, 55], 2, "unchanged");
  await page.evaluate(() => {
    window.objects.master.redStrength = 2;
    window.objects.master.blueStrength = 0;
  });
  await settled(page, [50, 190], [110, 55, 0], 3, "by channel");
  await page.evaluate(() => (window.objects.master.saturation = -1));
  const [red, green, blue] = await (async () => {
    await page.waitForTimeout(50);
    return colour(page, [50, 190]);
  })();
  expect(red).toBe(green);
  expect(green).toBe(blue);
});

test("a Vignette darkens the edges to its colour and leaves the middle", async ({ page }) => {
  await open(page, "qtless3d");
  await settled(page, [150, 187], [55, 55, 55], 3, "the middle");
  const [corner] = await colour(page, [101, 151]);
  expect(corner).toBeLessThan(45);
});

test("HDRBloomTonemap blooms what is bright, over its exposure and gamma", async ({ page }) => {
  await open(page, "qtless3d");
  const beside = [250 - 18, 187];
  await settled(page, [250, 187], [255, 255, 255], 3, "the bright rectangle");
  const [none] = await colour(page, beside);
  await page.evaluate(() => (window.objects.bloom.tonemappingLerp = 1));
  await expect.poll(async () => (await colour(page, beside))[0]).toBeGreaterThan(none + 3);
  await page.evaluate(() => {
    window.objects.bloom.tonemappingLerp = 0;
    window.objects.bloom.exposure = 2;
  });
  // Two stops: four times as bright. #101010 is 0.005 of linear light.
  await settled(page, [205, 155], [5, 5, 5], 3, "exposed");
});

test("a DebugView tells how the scene is being drawn", async ({ page }) => {
  await open(page, "qtless3d");
  // What is seen: a row with nothing to say is hidden.
  const text = () => page.evaluate(() => window.objects.debug.$node.innerText);
  await expect.poll(text).toMatch(/FPS: \d+/);
  expect(await text()).toMatch(/Frame: [\d.]+ ms/);
  expect(await text()).not.toMatch(/GPU:/);
});

test("an ExtendedSceneEnvironment of Ljós's is what Qt paints for the scene the others are held to", async ({ page }) => {
  await open(page, "extended3d");
  const read = await pixels(page, [[20, 20], [150, 100], [230, 120]]);
  read.map((each) => each.split(" ").map(Number)).forEach((each, index) => near(each, [[64, 80, 96], [30, 101, 48], [170, 170, 170]][index], 3, `point ${index}`));
});

test("a type of Qt's QML that Ljós has not written says so and names the module", async ({ page }) => {
  await open(page, "qtlessabsent");
  const said = await page.evaluate(() => window.objects.tried());
  expect(said).toBe("QtQuick3D.Effects: Blur is QML of Qt's own, and Qt's QtQuick3D.Effects is not installed here");
});

test("a shader named as what Qt's tool bakes needs no tool of Qt's", async ({ page }) => {
  await open(page, "qtlessshader");
  const Compiled = 0;
  await expect.poll(() => page.evaluate(() => JSON.parse(JSON.stringify(window.scene.statuses()))), {
    message: JSON.stringify(await page.evaluate(() => window.scene.logs())),
  }).toEqual([Compiled, Compiled, Compiled]);
  await settled(page, [50, 50], [0, 255, 0], 0, "what OpenGL ES does not say as OpenGL 4.4 does");
  await settled(page, [150, 50], [255, 0, 0], 0, "a block with a name");
  await settled(page, [250, 50], [0, 255, 0], 0, "a baked file with no source beside it");
});

test("a modal popup of a style with no shade of its own still shades the window", async ({ page }) => {
  await open(page, "qtlessdim");
  await settled(page, [20, 20], [148, 148, 149], 2, "what is behind it");
});
