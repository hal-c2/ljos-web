// The demos' remix knobs are one-line edits a reader makes: whatever
// number they type, the demo keeps to what it can draw.
import { expect, test } from "@playwright/test";
import { nextPalette, paletteIndex } from "../bundle/Demos/logic/shader.ts";

test("a Shader start palette out of range opens on one of the scheme's own ramps", () => {
  const count = 3;
  // light.frag keeps the dark ramps at 0..2 and the light ones at 3..5.
  for (const choice of [-4, -1, 0, 2, 3, 5, 6, 7, 100]) {
    const dark = paletteIndex(choice, true, count);
    const light = paletteIndex(choice, false, count);
    expect(dark, `startPalette ${choice} in dark`).toBeGreaterThanOrEqual(0);
    expect(dark, `startPalette ${choice} in dark`).toBeLessThan(count);
    expect(light, `startPalette ${choice} in light`).toBeGreaterThanOrEqual(count);
    expect(light, `startPalette ${choice} in light`).toBeLessThan(2 * count);
    expect(light - dark, `startPalette ${choice}: the same ramp in both schemes`).toBe(count);
  }
});

test("a tap from any start palette moves to the next of the scheme's ramps", () => {
  const count = 3;
  expect(nextPalette(0, count)).toBe(1);
  expect(nextPalette(2, count)).toBe(0);
  expect(nextPalette(-1, count)).toBe(0);
  expect(nextPalette(-5, count)).toBe(2);
  expect(nextPalette(7, count)).toBe(2);
});
