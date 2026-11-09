// The pointer handlers, driven by the browser's own mouse, wheel and
// fingers. What is expected is what Qt 6.11 does with the same scenes and
// the same moves, but for one thing: here a property has changed, and said
// so, before the signal that goes with it (`pressedChanged` before `tapped`),
// where Qt says so after.
import { expect, open, test } from "./open.js";

const advance = (page, ms) => page.evaluate((ms) => window.objects.clock.advance(ms), ms);
const log = (page) => page.evaluate(() => window.objects.log.splice(0));
const read = (page, name, property) =>
  page.evaluate(([name, property]) => window.objects[name][property], [name, property]);
const place = (page, name) => page.evaluate((name) => [window.objects[name].x, window.objects[name].y], name);

test("a tap is a press and a release in one place", async ({ page }) => {
  await open(page, "handlers");
  await page.mouse.move(10, 20);
  await page.mouse.down();
  expect(await log(page)).toEqual(["grab 1", "pressedChanged true point=10,20 pb=1", "point 10,20"]);
  expect(await read(page, "tap", "pressed")).toBe(true);
  await page.mouse.up();
  expect(await log(page)).toEqual([
    "pressedChanged false point=10,20 pb=0",
    "tapCount 1",
    "tapped b=1 pos=10,20 count=1 pressed=false",
    "singleTapped",
    "point 0,0",
    "grab 2",
  ]);
  // A second one soon after, in the same place, counts with the first.
  await page.mouse.down();
  await page.mouse.up();
  expect(await log(page)).toEqual([
    "grab 1",
    "pressedChanged true point=10,20 pb=1",
    "point 10,20",
    "pressedChanged false point=10,20 pb=0",
    "tapCount 2",
    "tapped b=1 pos=10,20 count=2 pressed=false",
    "doubleTapped",
    "point 0,0",
    "grab 2",
  ]);
  // Later, or elsewhere, it is the first again.
  await advance(page, 600);
  await page.mouse.click(10, 20);
  await page.mouse.click(40, 60);
  expect((await log(page)).filter((line) => line.startsWith("tap"))).toEqual([
    "tapCount 1",
    "tapped b=1 pos=10,20 count=1 pressed=false",
    "tapped b=1 pos=40,60 count=1 pressed=false",
  ]);
  // A button it does not accept is not its business.
  await page.mouse.click(10, 20, { button: "right" });
  expect(await log(page)).toEqual([]);
});

test("a press held long is a long press and no tap", async ({ page }) => {
  await open(page, "handlers");
  await page.mouse.move(10, 20);
  await page.mouse.down();
  await advance(page, 700);
  expect(await log(page)).toEqual(["grab 1", "pressedChanged true point=10,20 pb=1", "point 10,20"]);
  await advance(page, 300);
  expect(await log(page)).toEqual(["longPressed"]);
  await page.mouse.up();
  expect(await log(page)).toEqual(["pressedChanged false point=10,20 pb=0", "point 0,0", "grab 2"]);
});

test("a press dragged past the threshold is no tap", async ({ page }) => {
  await open(page, "handlers");
  await page.mouse.move(10, 20);
  await page.mouse.down();
  await page.mouse.move(15, 20);
  expect(await log(page)).toEqual(["grab 1", "pressedChanged true point=10,20 pb=1", "point 10,20", "point 15,20"]);
  await page.mouse.move(40, 20);
  expect(await log(page)).toEqual(["pressedChanged false point=15,20 pb=1", "canceled", "point 0,0"]);
  await page.mouse.up();
  expect(await log(page)).toEqual(["grab 2"]);
  // Within it, it still is one.
  await page.mouse.move(10, 20);
  await page.mouse.down();
  await page.mouse.move(15, 20);
  await page.mouse.up();
  expect(await log(page)).toEqual([
    "grab 1",
    "pressedChanged true point=10,20 pb=1",
    "point 10,20",
    "point 15,20",
    "pressedChanged false point=15,20 pb=0",
    "tapCount 1",
    "tapped b=1 pos=15,20 count=1 pressed=false",
    "singleTapped",
    "point 0,0",
    "grab 2",
  ]);
});

test("gesturePolicy says how far a press may go and still be a tap", async ({ page }) => {
  await open(page, "handlers");
  // WithinBounds: anywhere in the item, and no further.
  await page.mouse.move(110, 20);
  await page.mouse.down();
  await page.mouse.move(160, 20);
  await page.mouse.move(250, 20);
  await page.mouse.move(160, 20);
  await page.mouse.up();
  expect(await log(page)).toEqual(["within pressed true", "within pressed false", "within canceled"]);
  await page.mouse.move(110, 20);
  await page.mouse.down();
  await page.mouse.move(160, 20);
  await page.mouse.up();
  expect(await log(page)).toEqual(["within pressed true", "within pressed false", "within tapped"]);
  // ReleaseWithinBounds: anywhere at all, if it is let go in the item.
  await page.mouse.move(210, 20);
  await page.mouse.down();
  await page.mouse.move(260, 20);
  await page.mouse.move(350, 20);
  await page.mouse.move(260, 20);
  await page.mouse.up();
  expect(await log(page)).toEqual(["rwb pressed true", "rwb pressed false", "rwb tapped"]);
  await page.mouse.move(210, 20);
  await page.mouse.down();
  await page.mouse.move(350, 20);
  await page.mouse.up();
  expect(await log(page)).toEqual(["rwb pressed true", "rwb pressed false", "rwb canceled"]);
});

test("a handler takes the buttons and modifiers it accepts", async ({ page }) => {
  await open(page, "handlers");
  await page.mouse.click(310, 10);
  expect(await log(page)).toEqual([]);
  await page.mouse.click(310, 10, { button: "right" });
  expect(await log(page)).toEqual(["right tapped b=2"]);
  await page.keyboard.down("Control");
  await page.mouse.click(310, 10);
  await page.keyboard.up("Control");
  expect(await log(page)).toEqual(["ctrl tapped"]);
});

test("a tap is told to the handlers of every item under it, and to an area alone", async ({ page }) => {
  await open(page, "handlers");
  await page.mouse.click(35, 135);
  expect(await log(page)).toEqual([
    "inner pressed true",
    "outer pressed true",
    "inner pressed false",
    "inner tapped",
    "outer pressed false",
    "outer tapped",
  ]);
  await page.mouse.click(5, 105);
  expect(await log(page)).toEqual(["outer pressed true", "outer pressed false", "outer tapped"]);
  // A handler in something inside a MouseArea takes the press from it.
  await page.mouse.click(110, 110);
  expect(await log(page)).toEqual(["tap in ma tapped"]);
  // A MouseArea inside the handler's item keeps it from the handler.
  await page.mouse.click(210, 110);
  expect(await log(page)).toEqual(["child ma clicked"]);
});

test("a DragHandler moves its item once the press has gone the threshold", async ({ page }) => {
  await open(page, "handlers");
  await page.mouse.move(10, 210);
  await page.mouse.down();
  expect(await log(page)).toEqual(["centroid 10,10 sp=10 pp=10 pb=1"]);
  await page.mouse.move(15, 210);
  await page.mouse.move(25, 215);
  expect(await log(page)).toEqual([
    "centroid 15,10 sp=15 pp=10 pb=1",
    "drag tap canceled",
    "centroid 25,15 sp=25 pp=10 pb=1",
    "active true tr=0,0 c=25,15",
  ]);
  expect(await place(page, "dragItem")).toEqual([15, 205]);
  await page.mouse.move(45, 230);
  expect(await log(page)).toEqual(["centroid 30,25 sp=45 pp=10 pb=1", "xAxis 35 d=35", "tr 35,20 d=35,20 x=15"]);
  expect(await place(page, "dragItem")).toEqual([35, 220]);
  await page.mouse.up();
  expect(await log(page)).toEqual(["active false tr=0,0 c=10,10", "centroid 0,0 sp=0 pp=0 pb=0"]);
  expect(await place(page, "dragItem")).toEqual([35, 220]);
  expect(await read(page, "drag", "translation")).toEqual({ x: 0, y: 0 });
  expect(await read(page, "drag", "activeTranslation")).toEqual({ x: 0, y: 0 });
  expect(await read(page, "drag", "persistentTranslation")).toEqual({ x: 35, y: 20 });

  // The next drag adds to what the first made.
  await page.mouse.move(45, 230);
  await page.mouse.down();
  await page.mouse.move(80, 250);
  await page.mouse.move(90, 250);
  await page.mouse.up();
  expect(await place(page, "dragItem")).toEqual([80, 240]);
  expect(await read(page, "drag", "translation")).toEqual({ x: 0, y: 0 });
  expect(await read(page, "drag", "persistentTranslation")).toEqual({ x: 80, y: 40 });
  await log(page);

  // A press that goes nowhere is the TapHandler's.
  await page.mouse.click(90, 250);
  expect(await log(page)).toEqual(["centroid 10,10 sp=90 pp=10 pb=1", "drag tap tapped"]);
});

test("a drag keeps to its axes and their limits, and can move nothing", async ({ page }) => {
  await open(page, "handlers");
  await page.mouse.move(110, 210);
  await page.mouse.down();
  await page.mouse.move(130, 230);
  await page.mouse.move(300, 260);
  expect(await place(page, "limited")).toEqual([150, 200]);
  expect(await read(page, "lim", "translation")).toEqual({ x: 190, y: 0 });
  expect(await read(page, "lim", "activeTranslation")).toEqual({ x: 190, y: 0 });
  expect(await page.evaluate(() => window.objects.lim.xAxis.activeValue)).toBe(190);
  expect(await read(page, "lim", "active")).toBe(true);
  await page.mouse.up();
  expect(await read(page, "lim", "active")).toBe(false);
  // Let go, the mouse is over what it was dragged onto.
  expect(await log(page)).toEqual(["hovered true 0,60", "hp 0"]);
  await page.mouse.move(210, 210);
  expect(await log(page)).toEqual(["hovered false 0,60"]);

  await page.mouse.move(210, 210);
  await page.mouse.down();
  await page.mouse.move(230, 210);
  await page.mouse.move(260, 210);
  await page.mouse.up();
  expect(await log(page)).toEqual(["nt xAxis 50", "nt tr 50 d=50"]);
  expect(await place(page, "nullTarget")).toEqual([200, 200]);
});

test("a HoverHandler says the mouse is over its item, and where", async ({ page }) => {
  await open(page, "handlers");
  await page.mouse.move(5, 5);
  await page.mouse.move(310, 260);
  await page.mouse.move(320, 260);
  expect(await log(page)).toEqual(["hovered true 10,60", "hp 10", "hp 20"]);
  expect(await read(page, "hh", "hovered")).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(window.objects.hoverItem.$node).cursor)).toBe("pointer");
  // Over a child that hovers too, both are.
  await page.mouse.move(360, 210);
  expect(await log(page)).toEqual(["child hovered true", "hp 60"]);
  await page.mouse.move(5, 5);
  expect(await log(page)).toEqual(["hovered false 60,10", "child hovered false"]);
});

test("a WheelHandler counts what the wheel turns", async ({ page }) => {
  await open(page, "handlers");
  await page.mouse.move(310, 210);
  await log(page);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => read(page, "wh", "rotation")).toBe(15);
  expect(await log(page)).toEqual(["wheel active true", "wheel 120 x=10 rot=15 acc=true hr=0"]);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => read(page, "wh", "rotation")).toBe(-15);
  expect(await log(page)).toEqual(["wheel -240 x=10 rot=-15 acc=true hr=0"]);
  // It is active until the wheel has been still for `activeTimeout`.
  await advance(page, 50);
  expect(await read(page, "wh", "active")).toBe(true);
  await advance(page, 60);
  expect(await log(page)).toEqual(["wheel active false"]);
});

test("a MouseArea in a dragged item has the press until it is a drag", async ({ page }) => {
  await open(page, "handlers-mixed");
  await page.mouse.move(110, 10);
  await page.mouse.down();
  await page.mouse.move(115, 10);
  await page.mouse.move(130, 10);
  await page.mouse.move(160, 10);
  await page.mouse.up();
  expect(await log(page)).toEqual([
    "dhma pressed",
    "dhma pos",
    "dhma pos",
    "dhma canceled",
    "dh active true",
    "dh active false",
  ]);
  expect(await place(page, "dh")).toEqual([150, 0]);
  await page.mouse.click(160, 10);
  expect(await log(page)).toEqual(["dhma pressed", "dhma released", "dhma clicked"]);
});

test("a handler that takes the press for its own keeps it from those under it", async ({ page }) => {
  await open(page, "handlers-mixed");
  await page.mouse.click(210, 10);
  expect(await log(page)).toEqual(["exinner grab 16", "exinner tapped", "exinner grab 32"]);
  await page.mouse.click(260, 60);
  expect(await log(page)).toEqual(["exouter pressed true", "exouter pressed false", "exouter tapped"]);
  // An item's handlers see its press too.
  await page.mouse.click(310, 10);
  expect(await log(page)).toEqual(["both pressed", "both tapped", "both clicked"]);
  // The last declared of two is told first.
  await page.mouse.click(210, 110);
  expect(await log(page)).toEqual([
    "second-declared pressed true",
    "first-declared pressed true",
    "second-declared pressed false",
    "first-declared pressed false",
  ]);
});

test("a hovering item hides what is under it but not what it is in", async ({ page }) => {
  await open(page, "handlers-mixed");
  await page.mouse.move(390, 290);
  await page.mouse.move(10, 110);
  await page.mouse.move(11, 111);
  expect(await log(page)).toEqual(["hvma entered", "hv hovered true"]);
  await page.mouse.move(60, 110);
  expect(await log(page)).toEqual([]);
  await page.mouse.move(100, 110);
  expect(await log(page)).toEqual(["hv2 hovered true", "hvma exited", "hv hovered false"]);
});

test("exclusiveSignals holds a single tap back until it cannot be a double one", async ({ page }) => {
  await open(page, "handlers-mixed");
  await page.mouse.click(310, 110);
  expect(await log(page)).toEqual(["late tapped 1"]);
  await advance(page, 300);
  expect(await log(page)).toEqual([]);
  await advance(page, 200);
  expect(await log(page)).toEqual(["late single 10"]);
  await advance(page, 600);
  await page.mouse.click(310, 110);
  await advance(page, 100);
  await page.mouse.click(310, 110);
  await advance(page, 600);
  expect(await log(page)).toEqual(["late tapped 1", "late tapped 2", "late double"]);
});

test("a handler that is not enabled does nothing, one for another device neither", async ({ page }) => {
  await open(page, "handlers-mixed");
  await page.mouse.move(10, 210);
  await page.mouse.click(12, 212);
  expect(await log(page)).toEqual([]);
  expect(await read(page, "offHover", "hovered")).toBe(false);
  await page.evaluate(() => {
    window.objects.offTap.enabled = true;
    window.objects.offHover.enabled = true;
  });
  await page.mouse.move(14, 214);
  await page.mouse.click(14, 214);
  expect(await log(page)).toEqual(["off hovered true", "off tapped"]);

  await page.mouse.click(110, 210);
  expect(await log(page)).toEqual(["off hovered false", "mouse tapped"]);
  const touch = await fingers(page);
  await touch("touchStart", [1, 120, 220]);
  await touch("touchEnd");
  expect(await log(page)).toEqual(["finger tapped b=0"]);
});

// Fingers, as the device sends them: `touchStart` and `touchMove` say where
// all of them are, `touchEnd` which are lifted (all of them, if none). The
// page is given a move with its next frame, so each waits for the page to
// have had a pointer event for every finger it is about.
async function fingers(page) {
  const device = await page.context().newCDPSession(page);
  await page.evaluate(() => {
    window.touched = 0;
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
      document.addEventListener(type, (event) => void (window.touched += event.pointerType === "touch"));
    }
  });
  const down = new Set();
  let expected = 0;
  return async (type, ...points) => {
    const ids = points.map(([id]) => id);
    if (type === "touchStart") expected += ids.filter((id) => !down.has(id)).length;
    else if (type === "touchMove") expected += ids.length;
    else expected += ids.length || down.size;
    if (type === "touchStart") for (const id of ids) down.add(id);
    else if (type === "touchEnd") for (const id of ids.length ? ids : [...down]) down.delete(id);
    await device.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y })) });
    await page.waitForFunction((expected) => window.touched >= expected, expected);
  };
}

// The same lines, give or take a thousandth in their numbers: what Qt
// rounded one way may be rounded the other here.
function alike(lines, expected) {
  const number = /-?\d+(\.\d+)?/g;
  const shape = (list) => list.map((line) => String(line).replace(number, "#"));
  const numbers = (list) => list.flatMap((line) => (String(line).match(number) ?? []).map(Number));
  expect(shape(lines)).toEqual(shape(expected));
  const wanted = numbers(expected);
  numbers(lines).forEach((value, index) => expect(Math.abs(value - wanted[index])).toBeLessThan(0.0015));
}

const state = (page, names) =>
  page.evaluate((names) => {
    const round = (value) => Math.round(value * 1000) / 1000;
    const show = (value) =>
      typeof value === "number" ? round(value) : value && typeof value === "object" ? `${round(value.x)},${round(value.y)}` : value;
    return names.map((name) => {
      let value = window.objects;
      for (const part of name.split(".")) value = value[part];
      return show(value);
    });
  }, names);

test("a finger taps and drags as the mouse does", async ({ page }) => {
  await open(page, "handlers-touch");
  const touch = await fingers(page);
  await touch("touchStart", [1, 110, 230]);
  expect(await log(page)).toEqual(["tt grab 1", "tt pressed true"]);
  await touch("touchEnd");
  expect(await log(page)).toEqual(["tt pressed false", "tt tapped b=0 pos=10,10 count=1", "tt grab 2"]);

  await touch("touchStart", [1, 190, 230]);
  await touch("touchMove", [1, 195, 230]);
  await touch("touchMove", [1, 215, 240]);
  expect(await log(page)).toEqual(["td grab 1", "td grab 16", "td active true"]);
  expect(await place(page, "tdrag")).toEqual([205, 230]);
  await touch("touchMove", [1, 225, 240]);
  expect(await place(page, "tdrag")).toEqual([215, 230]);
  await touch("touchEnd");
  expect(await log(page)).toEqual(["td active false", "td grab 32", "td grab 2"]);
});

test("two fingers drag an item from where their middle came down", async ({ page }) => {
  await open(page, "handlers-touch");
  const touch = await fingers(page);
  // One finger is not the drag, and moves nothing.
  await touch("touchStart", [1, 345, 170]);
  expect(await log(page)).toEqual([]);
  expect(await place(page, "tdrag2")).toEqual([335, 155]);
  // The second makes it one: their middle is at (355,170), which is
  // (20,15) in the item, and that spot stays under their middle.
  await touch("touchStart", [1, 345, 170], [2, 365, 170]);
  await touch("touchMove", [1, 350, 173], [2, 370, 173]);
  expect(await place(page, "tdrag2")).toEqual([335, 155]);
  await touch("touchMove", [1, 365, 180], [2, 385, 180]);
  expect(await log(page)).toEqual(["td2 active true"]);
  expect(await place(page, "tdrag2")).toEqual([355, 165]);
  await touch("touchMove", [1, 375, 190], [2, 395, 190]);
  expect(await place(page, "tdrag2")).toEqual([365, 175]);
  await touch("touchEnd");
  expect(await log(page)).toEqual(["td2 active false"]);
  expect(await place(page, "tdrag2")).toEqual([365, 175]);
});

test("a third finger joins a drag and leaves it, and the item does not jump", async ({ page }) => {
  await open(page, "handlers-touch");
  const touch = await fingers(page);
  await touch("touchStart", [1, 135, 50]);
  await touch("touchStart", [1, 135, 50], [2, 185, 50]);
  await touch("touchMove", [1, 155, 60], [2, 205, 60]);
  expect(await log(page)).toEqual(["td3 active true"]);
  expect(await place(page, "tdrag3")).toEqual([140, 20]);
  // A third finger moves their middle by coming down, which is no move
  // of the drag's: the item goes only as far as the fingers go.
  await touch("touchStart", [1, 155, 60], [2, 205, 60], [3, 180, 90]);
  await touch("touchMove", [1, 165, 70], [2, 215, 70], [3, 190, 100]);
  expect(await place(page, "tdrag3")).toEqual([150, 30]);
  // It lifts: two fingers are still the drag, so it goes on from there.
  await touch("touchEnd", [3, 190, 100]);
  expect(await log(page)).toEqual([]);
  await touch("touchMove", [1, 175, 80], [2, 225, 80]);
  expect(await place(page, "tdrag3")).toEqual([160, 40]);
  // One more lifts: what is left is no drag, and it ends.
  await touch("touchEnd", [2, 225, 80]);
  expect(await log(page)).toEqual(["td3 active false"]);
  expect(await place(page, "tdrag3")).toEqual([160, 40]);
  await touch("touchEnd");
});

test("two fingers on a PinchHandler's item scale, turn and move it", async ({ page }) => {
  await open(page, "handlers-touch");
  const touch = await fingers(page);
  const item = ["pinched.scale", "pinched.rotation", "pinched.x", "pinched.y"];
  await touch("touchStart", [1, 140, 150]);
  expect(await log(page)).toEqual([]);
  await touch("touchStart", [1, 140, 150], [2, 160, 150]);
  expect(await log(page)).toEqual(["c 150,150", "grab 1"]);
  expect(await state(page, ["pinch.centroid.position"])).toEqual(["50,50"]);
  // Not far enough to be a pinch.
  await touch("touchMove", [1, 135, 150], [2, 165, 150]);
  expect(await log(page)).toEqual(["c 150,150"]);
  expect(await read(page, "pinch", "active")).toBe(false);
  await touch("touchMove", [1, 125, 150], [2, 175, 150]);
  expect(await log(page)).toEqual(["c 150,150", "grab 16", "grab 16", "active true c=50,50", "tr 0,0 d=0,0", "updated"]);
  expect(await state(page, item)).toEqual([1, 0, 100, 100]);
  // Turned about the middle of the two, and a little further apart.
  await touch("touchMove", [1, 125, 140], [2, 175, 160]);
  expect(await log(page)).toEqual([
    "c 150,150",
    "scale 1.077 d=1.077 as=1.077 ps=1.077",
    "rot 21.801 d=21.801",
    "tr 0,0 d=0,0",
    "updated",
  ]);
  expect(await state(page, item)).toEqual([1.077, 21.801, 100, 100]);
  // Both moved the same way.
  await touch("touchMove", [1, 135, 150], [2, 185, 170]);
  expect(await log(page)).toEqual(["c 160,160", "tr 10,10 d=10,10", "updated"]);
  expect(await state(page, [...item, "pinch.persistentTranslation", "pinch.centroid.position"])).toEqual([
    1.077,
    21.801,
    110,
    110,
    "10,10",
    "62.069,55.172",
  ]);
  // Far apart: no further than `maximumScale`.
  await touch("touchMove", [1, 85, 150], [2, 235, 170]);
  expect(await log(page)).toEqual([
    "c 160,160",
    "scale 1.2 d=1.114 as=1.2 ps=1.2",
    "rot 7.595 d=-14.207",
    "tr 10,10 d=0,0",
    "updated",
  ]);
  expect(await state(page, [...item, "pinch.centroid.position"])).toEqual([1.2, 7.595, 110, 110, "50,50"]);
  await touch("touchEnd");
  expect(await log(page)).toEqual(["active false c=50,50", "c 0,0", "grab 32", "grab 32", "grab 2"]);
  const values = ["scale", "activeScale", "persistentScale", "rotation", "activeRotation", "persistentRotation"];
  const moves = ["translation", "persistentTranslation", "centroid.position"];
  expect(await state(page, [...values, ...moves].map((name) => `pinch.${name}`))).toEqual([
    1.2,
    1,
    1.2,
    0,
    0,
    7.595,
    "0,0",
    "10,10",
    "0,0",
  ]);

  // The next pinch starts from what the first made of the item.
  await touch("touchStart", [1, 140, 150]);
  await touch("touchStart", [1, 140, 150], [2, 160, 150]);
  await touch("touchMove", [1, 125, 150], [2, 175, 150]);
  await touch("touchMove", [1, 115, 150], [2, 165, 150]);
  expect(await log(page)).toEqual([
    "c 150,150",
    "grab 1",
    "c 150,150",
    "grab 16",
    "grab 16",
    "active true c=40.638,42.841",
    "tr 0,0 d=0,0",
    "updated",
    "c 140,150",
    "tr -10,0 d=-10,0",
    "updated",
  ]);
  alike(await state(page, [...values, ...moves].map((name) => `pinch.${name}`)), [
    1.2,
    1,
    1.2,
    0,
    0,
    7.595,
    "-10,0",
    "0,10",
    "32.378,43.943",
  ]);
  expect(await state(page, item)).toEqual([1.2, 7.595, 100, 110]);
  // One finger lifted ends it; the other is the handler's until it lifts.
  await touch("touchEnd", [1, 115, 150]);
  alike(await log(page), ["active false c=32.378,43.943", "c 0,0", "grab 32"]);
  await touch("touchEnd");
  expect(await log(page)).toEqual(["grab 32", "grab 2"]);
});

test("two fingers on a PinchArea pinch its target", async ({ page }) => {
  await open(page, "handlers-touch");
  const touch = await fingers(page);
  const target = ["areaTarget.scale", "areaTarget.x", "areaTarget.y", "areaTarget.rotation"];
  await touch("touchStart", [1, 290, 50]);
  await touch("touchStart", [1, 290, 50], [2, 310, 50]);
  expect(await log(page)).toEqual([]);
  await touch("touchMove", [1, 280, 50], [2, 320, 50]);
  expect(await log(page)).toEqual(["started s=1 c=50,50 a=0 acc=true n=2 act=false"]);
  expect(await state(page, target)).toEqual([1, 0, 0, 0]);
  expect(await page.evaluate(() => window.objects.area.pinch.active)).toBe(true);
  await touch("touchMove", [1, 270, 50], [2, 330, 50]);
  expect(await log(page)).toEqual([
    "updated s=1.5 ps=1 c=50,50 pc=50,50 sc=50,50 a=0 pa=0 rot=0 p1=20,50 p2=80,50 sp1=40,50 n=2",
  ]);
  expect(await state(page, target)).toEqual([1.5, 0, 0, 0]);
  await touch("touchMove", [1, 280, 60], [2, 340, 60]);
  expect(await log(page)).toEqual([
    "updated s=1.5 ps=1.5 c=60,60 pc=50,50 sc=50,50 a=0 pa=0 rot=0 p1=30,60 p2=90,60 sp1=40,50 n=2",
  ]);
  expect(await state(page, target)).toEqual([1.5, 10, 10, 0]);
  await touch("touchMove", [1, 280, 50], [2, 340, 70]);
  expect(await log(page)).toEqual([
    "updated s=1.581 ps=1.5 c=60,60 pc=60,60 sc=50,50 a=-18.435 pa=0 rot=18.435 p1=30,50 p2=90,70 sp1=40,50 n=2",
  ]);
  expect(await state(page, target)).toEqual([1.581, 10, 10, 18.435]);
  // With one finger left the pinch goes on, and moves with it.
  await touch("touchEnd", [1, 280, 50]);
  expect(await log(page)).toEqual([
    "updated s=1.581 ps=1.581 c=60,60 pc=60,60 sc=50,50 a=-18.435 pa=-18.435 rot=18.435 p1=90,70 p2=90,70 sp1=40,50 n=1",
  ]);
  await touch("touchMove", [2, 350, 80]);
  expect(await log(page)).toEqual([
    "updated s=1.581 ps=1.581 c=70,70 pc=60,60 sc=50,50 a=-18.435 pa=-18.435 rot=18.435 p1=100,80 p2=100,80 sp1=40,50 n=1",
  ]);
  expect(await state(page, target)).toEqual([1.581, 20, 20, 18.435]);
  await touch("touchEnd");
  expect(await log(page)).toEqual(["finished s=1.581 c=70,70 n=0 act=true"]);
  expect(await state(page, target)).toEqual([1.581, 20, 20, 18.435]);
  expect(await page.evaluate(() => window.objects.area.pinch.active)).toBe(false);
});

test("a PinchArea takes two fingers from the MouseArea inside it", async ({ page }) => {
  await open(page, "handlers-touch");
  const touch = await fingers(page);
  await touch("touchStart", [1, 290, 120]);
  expect(await log(page)).toEqual(["inArea pressed"]);
  await touch("touchStart", [1, 290, 120], [2, 310, 120]);
  expect(await log(page)).toEqual(["inArea canceled"]);
  await touch("touchMove", [1, 270, 120], [2, 330, 120]);
  expect(await log(page)).toEqual(["started s=1 c=50,120 a=0 acc=true n=2 act=false"]);
  await touch("touchMove", [1, 260, 120], [2, 340, 120]);
  expect(await log(page)).toEqual([
    "updated s=1.333 ps=1 c=50,120 pc=50,120 sc=50,120 a=0 pa=0 rot=0 p1=10,120 p2=90,120 sp1=40,120 n=2",
  ]);
  expect(await state(page, ["areaTarget.scale"])).toEqual([1.333]);
  await touch("touchEnd", [1, 260, 120]);
  await log(page);
  await touch("touchEnd");
  expect(await log(page)).toEqual(["finished s=1.333 c=50,120 n=0 act=true"]);
  // One finger alone is the MouseArea's.
  await touch("touchStart", [1, 290, 120]);
  await touch("touchEnd");
  expect(await log(page)).toEqual(["inArea pressed", "inArea released", "inArea clicked"]);
});

test("a WheelHandler turns, scales and moves what its `property` names", async ({ page }) => {
  await open(page, "handlers-touch");
  const wheel = async (x, y, dx, dy, name, value) => {
    await page.mouse.move(x, y);
    await page.mouse.wheel(dx, dy);
    await expect.poll(async () => (await state(page, [name]))[0]).toBe(value);
  };
  // About the point the mouse is at.
  await wheel(10, 10, 0, -100, "wr.rotation", 15);
  expect(await log(page)).toEqual(["wr 120"]);
  expect(await state(page, ["wheeled.rotation", "wheeled.x", "wheeled.y"])).toEqual([15, -8.787, 6.742]);
  await wheel(40, 40, 0, -100, "wr.rotation", 30);
  expect(await state(page, ["wheeled.rotation", "wheeled.x", "wheeled.y"])).toEqual([30, -10.232, 4.238]);

  await wheel(40, 140, 0, -100, "ws.rotation", 15);
  expect(await state(page, ["scaled.scale", "scaled.x", "scaled.y"])).toEqual([1.26, 0, 100]);
  await wheel(10, 110, 0, 100, "ws.rotation", 0);
  expect(await state(page, ["scaled.scale", "scaled.x", "scaled.y"])).toEqual([1, -6.189, 93.811]);
  await wheel(10, 110, 0, 100, "ws.rotation", -15);
  expect(await state(page, ["scaled.scale", "scaled.x", "scaled.y"])).toEqual([0.794, -11.101, 88.899]);

  // Any other property is added to, by `rotationScale` for a degree.
  await log(page);
  await wheel(10, 210, 0, -100, "wx.rotation", 7.5);
  expect(await log(page)).toEqual(["wx active true"]);
  expect(await state(page, ["slid.x", "wx.active"])).toEqual([7.5, true]);
  await advance(page, 300);
  expect(await log(page)).toEqual(["wx active false"]);
  // The wheel turned the other way is not its.
  await page.mouse.wheel(-100, 0);
  await page.evaluate(() => (window.objects.slid.x = 30));
  await wheel(40, 210, 0, -100, "wx.rotation", 15);
  expect(await state(page, ["slid.x"])).toEqual([37.5]);
  await page.evaluate(() => (window.objects.wx.rotation = 2));
  expect(await state(page, ["slid.x"])).toEqual([37.5]);
  await wheel(40, 210, 0, 100, "wx.rotation", -5.5);
  expect(await state(page, ["slid.x"])).toEqual([30]);
});

test("a wheel a handler does not take goes to the next", async ({ page }) => {
  await open(page, "handlers-touch");
  await page.mouse.move(260, 210);
  // Sideways without Alt is nobody's; with it, the one that does not block.
  await page.mouse.wheel(-100, 0);
  await page.keyboard.down("Alt");
  await page.mouse.wheel(-100, 0);
  await expect.poll(async () => (await state(page, ["wo.rotation"]))[0]).toBe(0.15);
  expect(await state(page, ["op.opacity", "wo2.rotation"])).toEqual([0.65, 0]);
  expect(await log(page)).toEqual([]);
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await state(page, ["wo2.rotation"]))[0]).toBe(15);
  await page.keyboard.up("Alt");
  expect(await log(page)).toEqual(["wo2 0 120 10 10 134217728"]);
  expect(await state(page, ["op.opacity", "wo.rotation"])).toEqual([0.65, 0.15]);
});
