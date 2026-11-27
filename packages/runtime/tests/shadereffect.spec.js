// What `scenes/shadereffect.qml` is to look like is what Qt's documentation
// says of ShaderEffect: Qt's own offscreen platform, which answers for the
// other scenes, draws no shaders.
import { expect, test as plain } from "@playwright/test";
import { open } from "./open.js";
import { pixels } from "./pixels.js";

const RED = "255 0 0";
const GREEN = "0 255 0";
const BLUE = "0 0 255";
const WHITE = "255 255 255";

const Compiled = 0;
const Failed = 2;

// Two shaders of the scene are there to fail, and say so.
plain("an item is painted by its shaders, with its properties as their uniforms", async ({ page }) => {
  const warnings = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    // The graphics driver says of itself that the browser, drawing without a
    // screen, read a picture back.
    if (message.type() === "warning" && !message.text().includes("GL Driver Message")) warnings.push(message.text());
    // The browser says of itself that a file was not there.
    if (message.type() === "error" && !message.text().includes("404")) errors.push(message.text());
  });
  await open(page, "shadereffect");
  await expect.poll(() => page.evaluate(() => window.scene.statuses())).toEqual([Compiled, Compiled, Compiled, Compiled, Failed, Failed]);
  const logs = await page.evaluate(() => window.scene.logs());
  expect(logs[0]).toBe("");
  expect(logs[1]).toMatch(/nothing/);
  expect(logs[2]).toMatch(/none\.frag is not a shader/);

  // What Qt baked has a shader for each way of drawing Qt knows: the one for
  // OpenGL ES is what is drawn with.
  await expect.poll(() => page.evaluate(() => JSON.parse(JSON.stringify(window.scene.baked())))).toEqual([Compiled, ""]);
  expect(
    await pixels(page, [
      [250, 25],
      [330, 25],
    ]),
  ).toEqual([GREEN, BLUE]);

  const points = [
    // The tint as far as level and shift say, then blue.
    [10, 25],
    [70, 25],
    [80, 25],
    [150, 25],
    // A picture as a texture, its red and blue changed over.
    [20, 85],
    [80, 85],
    // Another effect as a texture, through a ShaderEffectSource.
    [10, 145],
    [90, 145],
    // Shaped by a vertex shader: half as wide, less at the middle rows.
    [45, 182],
    [20, 205],
    [35, 205],
    [70, 205],
    // Nothing is drawn by a shader that failed.
    [10, 250],
    // The part of a picture a ShaderEffectSource is of: its blue half.
    [130, 145],
    [210, 145],
  ];
  expect(await pixels(page, points)).toEqual([RED, RED, BLUE, WHITE, BLUE, RED, RED, BLUE, GREEN, GREEN, WHITE, WHITE, WHITE, BLUE, BLUE]);

  await page.evaluate(() => window.scene.step(0));
  expect((await pixels(page, points)).slice(0, 8)).toEqual([GREEN, BLUE, BLUE, WHITE, BLUE, RED, GREEN, BLUE]);

  // Of another size it is drawn again, as is one whose uniforms changed; an
  // item's opacity is the page's to apply.
  await page.evaluate(() => window.scene.step(1));
  const HALF = "127 255 127";
  const after = await pixels(page, points);
  expect(after.slice(0, 4)).toEqual([GREEN, BLUE, BLUE, BLUE]);
  expect(after.slice(8, 12)).toEqual([HALF, HALF, HALF, WHITE]);

  expect(errors).toEqual([]);
  expect(warnings.length).toBe(2);
  for (const warning of warnings) expect(warning).toMatch(/^ShaderEffect: /);
});

// Qt 6.11 says all of this where it draws with OpenGL, but for the version
// and what comes with it, which are a desktop's there (4.6, a compatibility
// profile, 2, of OpenGL, 1) and WebGL 2's here: OpenGL ES 3.0.
plain("an item says what it is drawn with, in Qt's names for it", async ({ page }) => {
  await open(page, "graphicsinfo");
  expect(await page.evaluate(() => window.scene.read())).toEqual({
    api: 3,
    same: true,
    upright: false,
    shader: [3, 2, 2],
    version: [3, 0, 0, 2],
    apis: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    shaders: [0, 1, 2, 3],
    compilations: [1, 2],
    sources: [1, 2, 4],
    profiles: [0, 1, 2],
    renderables: [0, 1, 2],
  });
});

// What the effects of a page draw with, from the page's own ShaderEffect.
async function heldIn(page) {
  return page.evaluateHandle(async () => {
    const address = performance.getEntriesByType("resource").find(({ name }) => /\/QtQuick\/ShaderEffect\.js(\?|$)/.test(name)).name;
    return (await import(address)).held;
  });
}

// A reader editing a shader gives the effect a new source at each pause
// in their typing. What it drew with before is let go once no effect
// draws with it: a visit spent editing keeps the sources and programs in
// use, not every one typed on the way. One still drawn with elsewhere
// stays, and is not compiled again.
plain("a shader no effect draws with any more is let go", async ({ page }) => {
  await open(page, "shaderedits");
  const held = await heldIn(page);
  const count = () => page.evaluate((held) => held(), held);
  await page.evaluate(() => window.scene.keep(0.5));
  for (let edit = 1; edit <= 12; edit++) {
    await page.evaluate((shade) => window.scene.edit(shade), edit / 100);
    await expect.poll(() => page.evaluate(() => window.scene.status())).toBe(Compiled);
  }
  expect(await count(), "the edit drawn now and the source the other effect keeps").toEqual({ texts: 2, programs: 2 });
  // Edited back to what the other effect draws with: one source, one program.
  await page.evaluate(() => window.scene.edit(0.5));
  await expect.poll(count).toEqual({ texts: 1, programs: 1 });
});

// A source written into its address is the shader the page was given:
// no server answered with a page of its own for it. Junk above its first
// line is the GLSL compiler's to say, with the line it is on; the message
// is the compiler's, not the address, which is the whole source again.
plain("a shader in its address with junk first is the compiler's to complain of", async ({ page }) => {
  const warnings = [];
  page.on("console", (message) => message.type() === "warning" && !message.text().includes("GL Driver Message") && warnings.push(message.text()));
  await open(page, "shaderedits");
  await page.evaluate(() => window.scene.editTo(`junk\n${window.scene.source(0.2)}`));
  await expect.poll(() => page.evaluate(() => window.scene.status())).toBe(Failed);
  const log = await page.evaluate(() => window.scene.log());
  expect(log).toMatch(/\b0:1\b/);
  expect(log).not.toContain("data:");
  expect(warnings).toEqual([`ShaderEffect: ${log}`]);
});
