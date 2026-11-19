// What is expected here is what Qt 6.11 answers for the same QML: `qml6` for
// the steps, and `qmltestrunner` with the same presses and moves for the mouse.
import { expect, open, stampPointers, test } from "./open.js";

// What `read()` answers at the start, part by part.
const START = {
  log: [],
  plain: [5, 0, 0, 0, [[-5, -10, true, true], [15, -10, true, false], [35, -10, true, false], [55, -10, true, false], [75, -10, true, false]]],
  ranged: [6, 0, 0, 0, [[90, 90, true, true], [90, 156.67, true, false], null, null, null, [23.33, 90, true, false]]],
  sizes: [["a", 2, true, true, true], ["b", 1.33, false, true, true], null, null, null, ["f", 1.33, false, true, true]],
  highlight: ["highlight", 85, 85],
  round: [4, 0, 0, 0, [[295, 95, true, true], [245, 145, true, false], [195, 95, true, false], [245, 45, true, false]]],
  rest: [1, -1, null, false, false, false, true, -1, 0, 0, 300, 0, 0, 2, 0, 0, 0, 0, 2500, 100, 2, 2, 2, 5, 4],
};

// Each step, and the parts it changes.
const STEPS = [
  // plain.offset = 1.5
  {
    log: ["plain current 4"],
    plain: [5, 4, 1.5, 4, [[25, -10, true, false], [45, -10, true, false], [65, -10, true, false], [85, -10, true, false], [5, -10, true, true]]],
    rest: [-1, -1, 1, false, false, false, true, -1, 0, 0, 300, 0, 0, 2, 0, 0, 0, 0, 2500, 100, 2, 2, 2, 5, 4],
  },
  // plain.currentIndex = 2
  {
    log: ["plain current 2"],
    plain: [5, 2, 3, 2, [[55, -10, true, false], [75, -10, true, false], [-5, -10, true, true], [15, -10, true, false], [35, -10, true, false]]],
    rest: [3, -1, null, false, false, false, true, -1, 0, 0, 300, 0, 0, 2, 0, 0, 0, 0, 2500, 100, 2, 2, 2, 5, 4],
  },
  // plain.offset = 7.25
  {
    log: ["plain current 3"],
    plain: [5, 3, 2.25, 3, [[40, -10, true, false], [60, -10, true, false], [80, -10, true, false], [0, -10, true, true], [20, -10, true, false]]],
    rest: [4, -1, 0, false, false, false, true, -1, 0, 0, 300, 0, 0, 2, 0, 0, 0, 0, 2500, 100, 2, 2, 2, 5, 4],
  },
  // plain.offset = -1
  {
    log: ["plain current 1"],
    plain: [5, 1, 4, 1, [[75, -10, true, false], [-5, -10, true, true], [15, -10, true, false], [35, -10, true, false], [55, -10, true, false]]],
    rest: [2, -1, null, false, false, false, true, -1, 0, 0, 300, 0, 0, 2, 0, 0, 0, 0, 2500, 100, 2, 2, 2, 5, 4],
  },
  // plain.incrementCurrentIndex()
  {
    log: ["plain current 2"],
    plain: [5, 2, 3, 2, [[55, -10, true, false], [75, -10, true, false], [-5, -10, true, true], [15, -10, true, false], [35, -10, true, false]]],
    rest: [3, -1, null, false, false, false, true, -1, 0, 0, 300, 0, 0, 2, 0, 0, 0, 0, 2500, 100, 2, 2, 2, 5, 4],
  },
  // plain.currentIndex = 0; plain.decrementCurrentIndex()
  {
    log: ["plain current 0", "plain current 4"],
    plain: [5, 4, 1, 4, [[15, -10, true, false], [35, -10, true, false], [55, -10, true, false], [75, -10, true, false], [-5, -10, true, true]]],
    rest: [0, -1, null, false, false, false, true, -1, 0, 0, 300, 0, 0, 2, 0, 0, 0, 0, 2500, 100, 2, 2, 2, 5, 4],
  },
  // ranged.currentIndex = 2
  {
    log: ["ranged current 2"],
    ranged: [6, 2, 4, 2, [null, [23.33, 90, true, false], [90, 90, true, true], [90, 156.67, true, false], null, null]],
    sizes: [null, ["b", 1.33, false, true, true], ["c", 2, true, true, true], ["d", 1.33, false, true, true], null, null],
  },
  // ranged.incrementCurrentIndex()
  {
    log: ["ranged current 3"],
    ranged: [6, 3, 3, 3, [null, null, [23.33, 90, true, false], [90, 90, true, true], [90, 156.67, true, false], null]],
    sizes: [null, null, ["c", 1.33, false, true, true], ["d", 2, true, true, true], ["e", 1.33, false, true, true], null],
  },
  // ranged.offset = 0.5
  {
    log: ["ranged current 0"],
    ranged: [6, 0, 0.5, 0, [[90, 123.33, true, true], null, null, null, [-10, 90, true, false], [56.67, 90, true, false]]],
    sizes: [["a", 1.67, true, true, true], null, null, null, ["e", 1, false, true, true], ["f", 1.67, false, true, true]],
  },
  // ranged.pathItemCount = 4
  {
    log: [],
    ranged: [6, 0, 0.5, 0, [[90, 115, true, true], [90, 165, true, false], null, null, [15, 90, true, false], [65, 90, true, false]]],
    sizes: [["a", 1.75, true, true, true], ["b", 1.25, false, true, true], null, null, ["e", 1.25, false, true, true], ["f", 1.75, false, true, true]],
  },
  // names.remove(1)
  {
    log: [],
    ranged: [5, 0, 0, 0, [[90, 90, true, true], [90, 140, true, false], null, [-10, 90, true, false], [40, 90, true, false]]],
    sizes: [["a", 2, true, true, true], ["c", 1.5, false, true, true], null, ["e", 1, false, true, true], ["f", 1.5, false, true, true]],
  },
  // ranged.currentIndex = 4; names.remove(4)
  {
    log: ["ranged current 4", "ranged current 3"],
    ranged: [4, 3, 1, 3, [[90, 140, true, false], [-10, 90, true, false], [40, 90, true, false], [90, 90, true, true]]],
    sizes: [["a", 1.5, false, true, true], ["c", 1, false, true, true], ["d", 1.5, false, true, true], ["e", 2, true, true, true]],
  },
  // names.insert(0, { name: "z" })
  {
    log: ["ranged current 4"],
    ranged: [5, 4, 1, 4, [[90, 140, true, false], null, [-10, 90, true, false], [40, 90, true, false], [90, 90, true, true]]],
    sizes: [["z", 1.5, false, true, true], null, ["c", 1, false, true, true], ["d", 1.5, false, true, true], ["e", 2, true, true, true]],
  },
  // names.move(4, 1, 1)
  {
    log: ["ranged current 1"],
    ranged: [5, 1, 4, 1, [[40, 90, true, false], [90, 90, true, true], [90, 140, true, false], null, [-10, 90, true, false]]],
    sizes: [["z", 1.5, false, true, true], ["e", 2, true, true, true], ["a", 1.5, false, true, true], null, ["d", 1, false, true, true]],
  },
  // ranged.positionViewAtIndex(1, PathView.Beginning)
  {
    log: ["ranged current 3"],
    ranged: [5, 3, 2, 3, [null, [-10, 90, true, false], [40, 90, true, false], [90, 90, true, true], [90, 140, true, false]]],
    sizes: [null, ["e", 1, false, true, true], ["a", 1.5, false, true, true], ["c", 2, true, true, true], ["d", 1.5, false, true, true]],
  },
  // ranged.positionViewAtIndex(1, PathView.End)
  {
    log: ["ranged current 0"],
    ranged: [5, 0, 0, 0, [[90, 90, true, true], [90, 140, true, false], null, [-10, 90, true, false], [40, 90, true, false]]],
    sizes: [["z", 2, true, true, true], ["e", 1.5, false, true, true], null, ["c", 1, false, true, true], ["d", 1.5, false, true, true]],
  },
  // ranged.positionViewAtIndex(1, PathView.Center)
  {
    log: ["ranged current 1"],
    ranged: [5, 1, 4, 1, [[40, 90, true, false], [90, 90, true, true], [90, 140, true, false], null, [-10, 90, true, false]]],
    sizes: [["z", 1.5, false, true, true], ["e", 2, true, true, true], ["a", 1.5, false, true, true], null, ["d", 1, false, true, true]],
  },
  // ranged.pathItemCount = undefined
  {
    log: [],
    ranged: [5, 1, 4, 1, [[50, 90, true, false], [90, 90, true, true], [90, 130, true, false], [90, 170, true, false], [10, 90, true, false]]],
    sizes: [["z", 1.6, false, true, true], ["e", 2, true, true, true], ["a", 1.6, false, true, true], ["c", 1.2, false, true, true], ["d", 1.2, false, true, true]],
  },
  // round.offset = 0.5; plain.model = 2
  {
    log: ["plain current 0"],
    plain: [2, 0, 0, 0, [[-5, -10, true, true], [45, -10, true, false]]],
    round: [4, 0, 0.5, 0, [[280.36, 130.36, true, true], [209.64, 130.36, true, false], [209.64, 59.64, true, false], [280.36, 59.64, true, false]]],
    rest: [-1, -1, 1, false, false, false, true, -1, 0, 0, 300, 0, 0, 2, 0, 0, 0, 0, 2500, 100, 2, 2, 2, 5, 4],
  },
  // plain.model = 0
  {
    log: [],
    plain: [0, 0, 0, null, []],
    rest: [-1, -1, null, false, false, false, true, -1, 0, 0, 300, 0, 0, 2, 0, 0, 0, 0, 2500, 100, 2, 2, 2, 5, 4],
  },
  // plain.model = 3; plain.currentIndex = 7
  {
    log: ["plain current 1"],
    plain: [3, 1, 2, 1, [[61.67, -10, true, false], [-5, -10, true, true], [28.33, -10, true, false]]],
  },
  // plain.snapMode = PathView.SnapToItem; plain.offset = 1.4
  {
    log: ["plain current 2"],
    plain: [3, 2, 1.4, 2, [[41.67, -10, true, false], [75, -10, true, false], [8.33, -10, true, true]]],
    rest: [-1, -1, 0, false, false, false, true, -1, 0, 0, 300, 1, 0, 2, 0, 0, 0, 0, 2500, 100, 2, 2, 2, 5, 4],
  },
  // plain.preferredHighlightBegin = 0.25; plain.preferredHighlightEnd = 0.25
  {
    log: [],
    plain: [3, 2, 1.4, 2, [[66.67, -10, true, false], [0, -10, true, false], [33.33, -10, true, true]]],
    rest: [-1, -1, null, false, false, false, true, -1, 0, 0, 300, 1, 0, 2, 0.25, 0.25, 0, 0, 2500, 100, 2, 2, 2, 5, 4],
  },
  // plain.currentIndex = 1
  {
    log: ["plain current 1"],
    plain: [3, 1, 2, 1, [[86.67, -10, true, false], [20, -10, true, true], [53.33, -10, true, false]]],
    rest: [1, -1, null, false, false, false, true, -1, 0, 0, 300, 1, 0, 2, 0.25, 0.25, 0, 0, 2500, 100, 2, 2, 2, 5, 4],
  },
  // plain.movementDirection = PathView.Positive; plain.currentIndex = 0
  {
    log: ["plain current 0"],
    plain: [3, 0, 0, 0, [[20, -10, true, true], [53.33, -10, true, false], [86.67, -10, true, false]]],
    rest: [0, -1, null, false, false, false, true, -1, 0, 0, 300, 1, 2, 2, 0.25, 0.25, 0, 0, 2500, 100, 2, 2, 2, 5, 4],
  },
  // round.currentIndex = 3
  {
    log: [],
    round: [4, 3, 1, 3, [[245, 145, true, false], [195, 95, true, false], [245, 45, true, false], [295, 95, true, true]]],
  },
  // root.side = 30
  {
    log: [],
    round: [4, 3, 1, 3, [[235, 135, true, false], [185, 85, true, false], [235, 35, true, false], [285, 85, true, true]]],
  },
];

const PARTS = Object.keys(START);

test("a PathView puts its rows along its path, as its offset and current row say", async ({ page }) => {
  await open(page, "pathview&still");
  const read = async () => Object.fromEntries((await page.evaluate(() => window.scene.read())).map((part, index) => [PARTS[index], part]));
  let expected = START;
  expect(await read()).toEqual(expected);
  for (const [index, changed] of STEPS.entries()) {
    // A move to another row takes `highlightMoveDuration`.
    await page.evaluate((index) => {
      window.scene.step(index);
      window.clock.advance(400);
    }, index);
    expected = { ...expected, ...changed };
    expect(await read(), `step ${index}`).toEqual(expected);
  }
});

const row = (x, current = false) => [x, 10, true, current];

test("the mouse turns a PathView, and lets go of it between rows or with a flick", async ({ page }) => {
  // The mouse's moves a frame apart, and its rests, as the test gives them
  // (open.js), not as quickly as a loaded machine sends them.
  const gap = await stampPointers(page);
  await open(page, "pathview&still");
  const read = () => page.evaluate(() => [window.scene.read()[0], ...window.scene.turning()]);
  const rest = (ms) => page.evaluate((ms) => window.clock.advance(ms), ms);
  const drag = async (from, to, by) => {
    await page.mouse.move(from, 260);
    await page.mouse.down();
    for (let x = from + by; by > 0 ? x <= to : x >= to; x += by) await page.mouse.move(x, 260);
  };
  // A point that rested before it was let go has no speed left.
  const drop = async () => {
    await gap(120);
    await page.mouse.up();
  };
  expect(await read()).toEqual([[], [4, 0, 0, 0, [row(-10, true), row(40), row(90), row(140)]], false, false, false]);

  // From a row with nothing in it: the press is the view's own. It is a drag
  // once it is past the threshold, and turns the view from the move after.
  await drag(50, 110, 5);
  expect(await read()).toEqual([
    ["turned started", "turned drag started", "turned current 3"],
    [4, 3, 0.9, 3, [row(35), row(85), row(135), row(185, true)]],
    true,
    true,
    false,
  ]);
  await drop();
  expect(await read()).toEqual([["turned drag ended"], [4, 3, 0.9, 3, [row(35), row(85), row(135), row(185, true)]], true, false, false]);
  // Left between two rows, it goes on to the nearer.
  await rest(500);
  expect(await read()).toEqual([["turned ended"], [4, 3, 1, 3, [row(40), row(90), row(140), row(-10, true)]], false, false, false]);

  // A click on a row's MouseArea is the MouseArea's.
  await page.mouse.click(50, 260);
  expect(await read()).toEqual([["clicked 0"], [4, 3, 1, 3, [row(40), row(90), row(140), row(-10, true)]], false, false, false]);

  // A drag from it is taken from it.
  await drag(50, 110, 5);
  expect(await read()).toEqual([
    ["turned started", "turned drag started", "canceled 0", "turned current 2"],
    [4, 2, 1.9, 2, [row(85), row(135), row(185, true), row(35)]],
    true,
    true,
    false,
  ]);
  await drop();
  await rest(500);
  expect(await read()).toEqual([["turned drag ended", "turned ended"], [4, 2, 2, 2, [row(90), row(140), row(-10, true), row(40)]], false, false, false]);

  // Let go while moving, it is flicked: with `SnapOneItem`, one row on.
  await page.evaluate(() => window.scene.step(27));
  await drag(100, 70, -5);
  await page.mouse.up();
  expect(await read()).toEqual([
    ["turned started", "turned drag started", "canceled 0", "turned drag ended", "turned flick started"],
    [4, 2, 1.7, 2, [row(75), row(125), row(175, true), row(25)]],
    true,
    false,
    true,
  ]);
  await rest(1500);
  expect(await read()).toEqual([
    ["turned current 3", "turned flick ended", "turned ended"],
    [4, 3, 1, 3, [row(40), row(90), row(140), row(-10, true)]],
    false,
    false,
    false,
  ]);
  await drag(100, 130, 5);
  await page.mouse.up();
  await rest(1500);
  expect(await read()).toEqual([
    ["turned started", "turned drag started", "turned drag ended", "turned flick started", "turned current 2", "turned flick ended", "turned ended"],
    [4, 2, 2, 2, [row(90), row(140), row(-10, true), row(40)]],
    false,
    false,
    false,
  ]);

  // A press that is on no row, with no `dragMargin`, is not the view's.
  await page.mouse.move(30, 245);
  await page.mouse.down();
  for (let x = 35; x <= 90; x += 5) await page.mouse.move(x, 245);
  await drop();
  await rest(500);
  expect(await read()).toEqual([[], [4, 2, 2, 2, [row(90), row(140), row(-10, true), row(40)]], false, false, false]);
});
