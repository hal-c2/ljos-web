import { expect, open, rect, test } from "./open.js";

// Time in a scene stands still; this lets `ms` of it pass.
const advance = (page, ms) => page.evaluate((ms) => window.objects.clock.advance(ms), ms);

test("an animation on a property runs from the start, a frame at a time", async ({ page }) => {
  await open(page, "animation");
  expect(await page.evaluate(() => [window.objects.source.running, window.objects.box.y])).toEqual([true, 0]);
  await advance(page, 160);
  expect(await rect(page, "box")).toEqual({ x: 0, y: 16, width: 50, height: 50 });
  await advance(page, 340);
  expect(await rect(page, "box")).toEqual({ x: 0, y: 50, width: 50, height: 50 });
  await advance(page, 600);
  expect(await page.evaluate(() => [window.objects.source.running, window.objects.box.y])).toEqual([false, 100]);
  expect(await page.evaluate(() => window.objects.clock.running)).toBe(false);
});

// What a host reads of the page's clock (a test, the Observer): how many
// frames it ran and how much time it handed out, counted where it steps,
// and how many jobs it has, so a host asks "has time moved for the scene",
// or "is there anything left to move", of the scene, not of its own clock,
// which a loaded machine slows.
test("the clock counts the frames it ran and the time it gave, for a host to read", async ({ page }) => {
  await open(page, "animation");
  const counted = () => page.evaluate(() => ({ ...globalThis[Symbol.for("ljos-web/clock")] }));
  const from = await counted();
  expect(from.jobs, "jobs on the clock: the animation that runs from the start").toBe(1);
  await advance(page, 160);
  const ran = await counted();
  expect({ frames: ran.frames - from.frames, time: ran.time - from.time }, "frames and time the clock counted for 160 ms").toEqual({ frames: 10, time: 160 });
  // Once nothing moves, time asked to pass is not handed out, nor counted.
  await advance(page, 2000);
  const ended = await counted();
  expect(ended.jobs, "jobs on the clock once the animation ended").toBe(0);
  await advance(page, 500);
  expect(await counted(), "what a clock with nothing to run counted").toEqual(ended);
});

test("an animation says what it does in Qt's order", async ({ page }) => {
  await open(page, "animation");
  const started = await page.evaluate(() => {
    const { move, box, log } = window.objects;
    move.start();
    return [box.x, move.running, [...log]];
  });
  // The first value is written as it starts, after `started`.
  expect(started).toEqual([10, true, ["started 0 true", "running true"]]);
  await advance(page, 100);
  // InQuad: a quarter of the way at half the time.
  expect(await page.evaluate(() => window.objects.box.x)).toBe(35);
  await advance(page, 100);
  expect(await page.evaluate(() => window.objects.log.slice(2))).toEqual([
    "stopped 110 false",
    "running false",
    "finished 110 false",
  ]);
  const stopped = await page.evaluate(() => {
    const { move, box, log } = window.objects;
    log.length = 0;
    move.start();
    window.objects.clock.advance(100);
    move.stop();
    return [box.x, [...log]];
  });
  // Stopped by hand it has not finished, and stays where it was.
  expect(stopped).toEqual([35, ["started 110 true", "running true", "stopped 35 false", "running false"]]);
});

test("an animation loops, pauses, and runs to the end of a loop when told to", async ({ page }) => {
  await open(page, "animation");
  const read = (name) => page.evaluate((name) => window.objects.box[name], name);
  await page.evaluate(() => window.objects.loop.start());
  await advance(page, 48);
  expect(await read("opacity")).toBeCloseTo(0.52, 10);
  await advance(page, 102);
  // Half way through the second loop.
  expect(await read("opacity")).toBeCloseTo(0.5, 10);
  const paused = await page.evaluate(() => {
    const { loop, box, clock } = window.objects;
    loop.pause();
    clock.advance(100);
    const held = [loop.paused, loop.running, box.opacity];
    loop.resume();
    clock.advance(140);
    return [...held, loop.running, box.opacity];
  });
  expect(paused[0]).toBe(true);
  expect(paused[1]).toBe(true);
  expect(paused[2]).toBeCloseTo(0.5, 10);
  expect(paused[3]).toBe(true);
  expect(paused[4]).toBeCloseTo(0.1, 10);
  await advance(page, 16);
  expect(await page.evaluate(() => [window.objects.loop.running, window.objects.box.opacity])).toEqual([false, 0]);

  const forever = await page.evaluate(() => {
    const { forever, box, log, clock } = window.objects;
    forever.start();
    clock.advance(250);
    forever.stop();
    // It reads as stopped, and goes on to the end of the loop it was in.
    const after = [forever.running, box.rotation, [...log]];
    clock.advance(32);
    const during = box.rotation;
    clock.advance(100);
    return [...after, during > 180 && during < 360, [...log], clock.running];
  });
  expect(forever).toEqual([false, 180, [], true, ["forever stopped 360", "forever finished 360"], true]);
});

test("an animation with no duration is over as it starts", async ({ page }) => {
  await open(page, "animation");
  const read = await page.evaluate(() => {
    const { instant, grow, box, log, clock } = window.objects;
    instant.start();
    const now = [box.z, instant.running, [...log]];
    grow.start();
    clock.advance(50);
    const half = [box.width, box.height];
    grow.complete();
    return [...now, half, [box.width, box.height, grow.running]];
  });
  expect(read).toEqual([5, false, ["instant started", "instant finished 5"], [65, 65], [80, 80, false]]);
});

test("a sequence does one thing after another, and again", async ({ page }) => {
  await open(page, "groups");
  await page.evaluate(() => window.objects.sequence.start());
  await advance(page, 48);
  expect(await rect(page, "box")).toEqual({ x: 0, y: 0, width: 98, height: 50 });
  await advance(page, 16);
  // The animation it passed the end of is at its end, and the script ran.
  expect(await rect(page, "box")).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  expect(await page.evaluate(() => [...window.objects.log])).toEqual(["script 100"]);
  await advance(page, 61);
  expect(await rect(page, "box")).toEqual({ x: 0, y: 0, width: 75, height: 77 });
  await advance(page, 25);
  // The second loop starts from where the first ended.
  expect(await rect(page, "box")).toEqual({ x: 0, y: 0, width: 50, height: 77 });
  expect(await page.evaluate(() => window.objects.sequence.running)).toBe(true);
  await advance(page, 150);
  expect(await page.evaluate(() => [window.objects.sequence.running, ...window.objects.log])).toEqual([
    false,
    "script 100",
    "script 100",
    "sequence finished 50 77",
  ]);
});

test("a parallel group runs its animations side by side", async ({ page }) => {
  await open(page, "groups");
  const colour = () => page.evaluate(() => getComputedStyle(window.objects.box.$node).backgroundColor);
  await page.evaluate(() => window.objects.together.start());
  await advance(page, 100);
  expect(await rect(page, "box")).toEqual({ x: 100, y: 25, width: 50, height: 50 });
  expect(await colour()).toBe("rgb(255, 0, 0)");
  await advance(page, 50);
  expect(await rect(page, "box")).toEqual({ x: 100, y: 37.5, width: 50, height: 50 });
  // A colour is animated through the colours between.
  expect(await page.evaluate(() => String(window.objects.box.color))).toBe("#800080");
  expect(await colour()).toBe("rgb(128, 0, 128)");
  await advance(page, 50);
  expect(await page.evaluate(() => [window.objects.together.running, String(window.objects.box.color)])).toEqual([
    false,
    "#0000ff",
  ]);
});

test("a group on a property gives the property to its animations", async ({ page }) => {
  await open(page, "groups");
  const read = await page.evaluate(() => {
    const { bounce, other, clock } = window.objects;
    const before = [bounce.running, bounce.loops, clock.running];
    bounce.start();
    clock.advance(50);
    const there = other.x;
    clock.advance(100);
    const back = other.x;
    clock.advance(200);
    const again = other.x;
    bounce.stop();
    return [before, there, back, again, bounce.running, clock.running];
  });
  expect(read).toEqual([[false, -1, false], 50, 50, 50, false, false]);
});

test("a rotation goes the way it is told, a grouped property is animated, other types jump", async ({ page }) => {
  await open(page, "groups");
  const read = await page.evaluate(() => {
    const { turn, thicken, jump, other, clock } = window.objects;
    turn.start();
    thicken.start();
    jump.start();
    clock.advance(50);
    const half = [other.rotation, other.border.width, other.visible];
    clock.advance(50);
    return [half, [other.rotation, other.border.width, other.visible]];
  });
  expect(read).toEqual([
    [360, 4, true],
    [10, 6, false],
  ]);
});

test("a script is run when its animation or its state comes to it, every time", async ({ page }) => {
  await open(page, "scripts&still");
  const read = () => page.evaluate(() => window.scene.read());
  const step = (index) => page.evaluate((index) => window.scene.step(index), index);
  expect(await read()).toEqual([0, []]);
  // Qt's answers. A function a script is worth is not called.
  await step(0);
  expect(await read()).toEqual([5, ["block", "given called"]]);
  await step(1);
  expect(await read()).toEqual([6, ["lap 6"]]);
  await page.evaluate(() => window.clock.advance(250));
  expect(await read()).toEqual([8, ["lap 7", "lap 8"]]);
  await step(2);
  expect(await read()).toEqual([8, ["entered at 8"]]);
});
