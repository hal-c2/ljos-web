// MultiEffect and RectangularShadow. The colours they are compared with are
// what Qt 6 painted for the same QML, on a GPU: a blur and a shadow are
// softer or harder there by a little, a colour is the same.
import { expect, open, test } from "./open.js";
import { pixels } from "./pixels.js";
import { gpu, narrowed } from "./raster.js";

const colours = async (page, points) => (await pixels(page, points)).map((colour) => colour.split(" ").map(Number));

function near(read, wanted, slack = 2) {
  expect(read.length).toBe(wanted.length);
  read.forEach((colour, index) => {
    const off = Math.max(...colour.map((channel, each) => Math.abs(channel - wanted[index][each])));
    expect(off, `colour ${index}: ${colour} for ${wanted[index]}`).toBeLessThanOrEqual(slack);
  });
}

// How dark the points are, from 0 for the white of the page to 1.
const darkness = async (page, points) => (await colours(page, points)).map(([red]) => 1 - red / 255);

function shaded(read, wanted, slack) {
  read.forEach((dark, index) => {
    expect(Math.abs(dark - wanted[index]), `point ${index}: ${dark.toFixed(3)} for ${wanted[index]}`).toBeLessThan(slack);
  });
}

// What an effect did to its source's element.
const given = (page, names) =>
  page.evaluate(
    (names) =>
      names.map((name) => {
        const node = window.objects[name].$node;
        const { x, y, width, height } = node.getBoundingClientRect();
        return {
          filter: node.style.filter,
          mask: node.style.mask,
          clip: node.style.clipPath,
          shown: node.classList.contains("qq-effect-shown"),
          display: getComputedStyle(node).display,
          box: [x, y, width, height],
        };
      }),
    names,
  );

const BLUE = [51, 102, 153];
const WHITE = [255, 255, 255];

// What Qt's says of itself when nothing was set.
const STARTS = {
  source: "null",
  autoPaddingEnabled: "true",
  paddingRect: "QRectF(0, 0, 0, 0)",
  brightness: "0",
  contrast: "0",
  saturation: "0",
  colorization: "0",
  colorizationColor: "#ff0000",
  blurEnabled: "false",
  blur: "0",
  blurMax: "32",
  blurMultiplier: "0",
  shadowEnabled: "false",
  shadowOpacity: "1",
  shadowBlur: "1",
  shadowHorizontalOffset: "0",
  shadowVerticalOffset: "0",
  shadowColor: "#000000",
  shadowScale: "1",
  maskEnabled: "false",
  maskSource: "null",
  maskThresholdMin: "0",
  maskSpreadAtMin: "0",
  maskThresholdMax: "1",
  maskSpreadAtMax: "0",
  maskInverted: "false",
  itemRect: "QRectF(0, 0, 0, 0)",
  hasProxySource: "false",
};

test("an effect starts as Qt's does", async ({ page }) => {
  await open(page, "effects");
  const read = await page.evaluate(
    (names) => Object.fromEntries(names.map((name) => [name, String(window.objects.none[name])])),
    Object.keys(STARTS),
  );
  expect(read).toEqual(STARTS);
  expect(await page.evaluate(() => [window.objects.none.width, window.objects.none.implicitWidth])).toEqual([0, 0]);
});

// Three strips, #336699, #ff8000 and #202020, through each change of colour.
const TINTS = {
  brighter: [[128, 178, 229], [255, 204, 76], [108, 108, 108]],
  contrasty: [[13, 89, 166], [255, 128, 0], [0, 0, 0]],
  grey: [[93, 93, 93], [151, 151, 151], [32, 32, 32]],
  vivid: [[9, 111, 213], [255, 105, 0], [32, 32, 32]],
  tinted: [[0, 58, 93], [0, 95, 151], [0, 20, 32]],
  // The colour's own alpha is part of how much it tints.
  halfTinted: [[38, 100, 115], [191, 134, 0], [24, 32, 24]],
  // All four at once: the order Qt does them in shows.
  mixed: [[0, 19, 179], [63, 10, 132], [11, 11, 112]],
  plain: [BLUE, [255, 128, 0], [32, 32, 32]],
};

test("the colours of a source are changed as Qt changes them", async ({ page }) => {
  await open(page, "effects");
  // The effects are side by side in this order, 40 apart.
  const points = Object.keys(TINTS).flatMap((name, index) => [5, 15, 25].map((strip) => [10 + 40 * index + strip, 20]));
  near(await colours(page, points), Object.values(TINTS).flat());
});

test("the changes of colour are one matrix, and none when nothing changes", async ({ page }) => {
  await open(page, "effects");
  const read = await page.evaluate(() => {
    const o = window.objects;
    const matrix = (name) => o[name].$node.querySelector("feColorMatrix")?.getAttribute("values") ?? null;
    const filter = (name) => o[name].$node.style.filter;
    const before = [filter("s0"), matrix("brighter"), filter("s7"), matrix("plain"), matrix("mixed")];
    o.brighter.brightness = -0.3;
    const darker = matrix("brighter");
    o.brighter.brightness = 0;
    return { before, darker, after: filter("s0"), id: o.brighter.$node.querySelector("filter").id };
  });
  expect(read.before).toEqual([
    `url("#${read.id}")`,
    "1 0 0 0 0.3 0 1 0 0 0.3 0 0 1 0 0.3 0 0 0 1 0",
    "",
    null,
    "0.3154 -0.2054 -0.0399 0 0.035 -0.1046 0.2146 -0.0399 0 0.035 0.0837 0.1644 0.4519 0 0.35 0 0 0 1 0",
  ]);
  expect(read.darker).toBe("1 0 0 0 -0.3 0 1 0 0 -0.3 0 0 1 0 -0.3 0 0 0 1 0");
  expect(read.after).toBe("");
});

test("a changed property changes the picture", async ({ page }) => {
  await open(page, "effects");
  await page.evaluate(() => (window.objects.brighter.brightness = -0.3));
  near(await colours(page, [[15, 20], [25, 20], [35, 20]]), [[0, 25, 76], [178, 51, 0], [0, 0, 0]]);
});

test("a hidden source is shown where its effect is", async ({ page }) => {
  await open(page, "effects");
  const [far, unseen, inner, dark] = await given(page, ["far", "unseen", "inner", "dark"]);
  // Twice its size, as the effect is.
  expect(far.box).toEqual([20, 130, 60, 40]);
  expect([far.shown, far.display]).toEqual([true, "block"]);
  // What is hidden inside it stays hidden.
  expect([unseen.shown, unseen.display]).toEqual([false, "none"]);
  // In another item than the effect.
  expect(inner.box).toEqual([300, 130, 30, 20]);
  expect(dark.filter).toBe("opacity(0.5)");
  expect(await page.evaluate(() => [window.objects.far.visible, window.objects.far.x, window.objects.far.width])).toEqual([
    false,
    0,
    30,
  ]);
  const read = await colours(page, [
    [30, 150],
    [50, 150],
    [70, 150],
    // Where the red square inside it is, were it shown.
    [25, 135],
    // What is outside the source is not part of it.
    [85, 135],
    [140, 150],
    [305, 140],
    [315, 140],
  ]);
  near(read, [BLUE, [255, 128, 0], [32, 32, 32], BLUE, WHITE, [128, 128, 128], BLUE, [255, 128, 0]]);
});

test("the source follows its effect, and is hidden again with it", async ({ page }) => {
  await open(page, "effects");
  await page.evaluate(() => {
    window.objects.moved.x = 40;
    window.objects.moved.height = 20;
  });
  expect((await given(page, ["far"]))[0].box).toEqual([40, 130, 60, 20]);
  await page.evaluate(() => (window.objects.moved.visible = false));
  const [far] = await given(page, ["far"]);
  expect([far.shown, far.display, far.filter]).toEqual([false, "none", ""]);
  expect(await page.evaluate(() => window.objects.far.$node.getAttribute("style"))).not.toMatch(/translate:|scale:/);
  near(await colours(page, [[50, 140]]), [WHITE]);
  await page.evaluate(() => (window.objects.moved.visible = true));
  near(await colours(page, [[50, 140]]), [BLUE]);
});

test("an effect given another source lets go of the first", async ({ page }) => {
  await open(page, "effects");
  near(await colours(page, [[370, 150]]), [[255, 0, 0]]);
  await page.evaluate(() => void window.objects.setWhich(window.objects.second));
  const [first, second] = await given(page, ["first", "second"]);
  expect([first.shown, first.display]).toEqual([false, "none"]);
  expect(second.box).toEqual([350, 130, 40, 40]);
  near(await colours(page, [[370, 150]]), [[0, 0, 255]]);
});

test("a source that is shown has its shadow as in Qt", async ({ page }) => {
  await open(page, "effects");
  const [card] = await given(page, ["card"]);
  expect(card.filter).toBe("drop-shadow(rgba(0, 0, 0, 0.5) 0px 0px 6.6257px)");
  expect([card.shown, card.box]).toEqual([false, [20, 60, 60, 40]]);
  // From the card's edge outwards, half as dark as a black shadow would be.
  shaded(await darkness(page, [[80, 80], [82, 80], [84, 80], [88, 80], [92, 80], [50, 80]]), [0.224, 0.153, 0.102, 0.055, 0.027, 0], 0.04);
  await page.evaluate(() => void window.objects.setOn(false));
  expect((await given(page, ["card"]))[0].filter).toBe("");
  shaded(await darkness(page, [[80, 80]]), [0], 0.01);
});

test("a source that is shown is changed where it is", async ({ page }) => {
  await open(page, "effects");
  const [button] = await given(page, ["button"]);
  // Not blurred: Qt's blurred copy is behind or in front of the item, which
  // stays sharp. The shadow is as faint as the effect is.
  expect(button.filter).toBe("drop-shadow(rgba(0, 0, 0, 0.5) 0px 0px 6.6257px)");
  const read = await colours(page, [
    [130, 80],
    // Half of the red the effect would make of it, over the item itself.
    [190, 80],
    [250, 80],
    [231, 61],
  ]);
  near(read, [[44, 222, 133], [72, 51, 77], BLUE, BLUE]);
});

test("a blur is as soft as Qt's", async ({ page }) => {
  await open(page, "effects");
  expect((await given(page, ["black"]))[0].filter).toBe("blur(6.6257px)");
  // Across the left edge of a black square, which is at 30.
  const across = [-8, -4, 0, 3, 7].map((offset) => [30 + offset, 220]);
  shaded(await darkness(page, across), [0.125, 0.247, 0.522, 0.718, 0.843], 0.08);
  const filters = await page.evaluate(() => {
    const { soft, black } = window.objects;
    const read = [];
    const filter = () => read.push(black.$node.style.filter);
    soft.blur = 0.5;
    filter();
    soft.blur = 0.25;
    filter();
    soft.blur = 1;
    soft.blurMax = 64;
    filter();
    soft.blurMax = 32;
    soft.blurMultiplier = 2;
    filter();
    soft.blur = 0;
    filter();
    soft.blur = 1;
    soft.blurEnabled = false;
    filter();
    return read;
  });
  // Qt's are as soft as 2.75, 1.5, 21 and 23.75 pixels.
  expect(filters).toEqual(["blur(2.8px)", "blur(1.5228px)", "blur(22.4px)", "blur(19.877px)", "", ""]);
});

test("a hidden source casts its shadow", async ({ page }) => {
  await open(page, "effects");
  const [white, blue] = await given(page, ["white", "blue"]);
  expect(white.filter).toBe("drop-shadow(rgba(255, 0, 0, 0.5) 10px 5px 0px)");
  // The shadow is of the source before its blur: no softer for it.
  expect(blue.filter).toBe("blur(2.8px) drop-shadow(rgb(0, 0, 0) 0px 0px 6.005px)");
  near(await colours(page, [[130, 220], [155, 222], [130, 243], [155, 202], [163, 222]]), [
    WHITE,
    [255, 128, 128],
    [255, 128, 128],
    WHITE,
    WHITE,
  ]);
});

test("a blur ends where the effect's rectangle does when it is told to", async ({ page }) => {
  await open(page, "effects");
  const [tight, roomy] = await given(page, ["black2", "black3"]);
  expect(tight.clip).toBe("inset(0px)");
  expect(roomy.clip).toBe("inset(0px 0px -20px -20px)");
  const dark = await darkness(page, [[266, 220], [290, 195], [336, 220], [360, 244], [384, 220], [360, 196]]);
  shaded([dark[0], dark[1], dark[4], dark[5]], [0, 0, 0, 0], 0.01);
  expect(dark[2]).toBeGreaterThan(0.1);
  expect(dark[3]).toBeGreaterThan(0.1);
  const rects = await page.evaluate(() => {
    const o = window.objects;
    const read = ["plain", "soft", "cast", "tight", "roomy"].map((name) => String(o[name].itemRect));
    o.soft.blurMax = 64;
    o.soft.blurMultiplier = 0.5;
    read.push(String(o.soft.itemRect), o.soft.hasProxySource);
    return read;
  });
  expect(rects).toEqual([
    "QRectF(0, 0, 30, 20)",
    "QRectF(-32, -32, 104, 104)",
    "QRectF(-32, -32, 104, 104)",
    "QRectF(0, 0, 40, 40)",
    "QRectF(-20, 0, 60, 60)",
    "QRectF(-96, -96, 232, 232)",
    true,
  ]);
});

// The scene, once the pictures the masks are have arrived.
async function masks(page) {
  await open(page, "effectmasks");
  await page.waitForFunction(() => window.objects.circle.status === 1 && window.objects.fade.status === 1);
}

test("a mask shows what it is not clear in", async ({ page }) => {
  await masks(page);
  const at = (x) => [
    [x + 20, 30],
    [x + 2, 12],
  ];
  const read = await colours(page, [10, 60, 110, 160, 210, 260, 310].flatMap(at));
  near(read, [
    // A picture of a disc.
    BLUE,
    WHITE,
    // The same, the other way round.
    WHITE,
    BLUE,
    // A rectangle with round corners.
    BLUE,
    WHITE,
    // A smaller one that is half clear: stretched, and no fainter for it.
    BLUE,
    WHITE,
    // Not enabled.
    BLUE,
    BLUE,
    // A source that is shown is seen whole, beside its masked copy.
    BLUE,
    BLUE,
    // An item there is no picture of.
    BLUE,
    BLUE,
  ]);
  const [round, off, shown] = await given(page, ["b0", "b4", "b5"]);
  expect(round.mask).toMatch(/^url\("#qq-effect-\d+-mask"\)$/);
  expect([off.mask, shown.mask]).toEqual(["", ""]);
});

// How much of the source shows, from 0 to 1.
const coverage = async (page, points) => (await colours(page, points)).map(([red]) => (255 - red) / 204);

test("the thresholds of a mask are Qt's", async ({ page }) => {
  await masks(page);
  // The mask is clear on the left and opaque on the right.
  const along = (x, y, offsets) => offsets.map((offset) => [x + offset, y + 20]);
  // By default, whatever is not altogether clear. The mask's first column
  // is altogether clear and its second is not (3 of 255): a GPU reads the
  // stretched mask between the two, and shows the first.
  const renderer = await gpu(page);
  if (renderer) narrowed(test.info(), renderer, "the mask's first column, clear, is read between it and the next, which is not, and shows");
  const first = renderer ? [5, 50, 95] : [0, 5, 50, 95];
  shaded(await coverage(page, along(10, 70, first)), [0, 1, 1, 1].slice(-first.length), 0.01);
  shaded(await coverage(page, along(130, 70, [5, 45, 55, 95])), [0, 0, 1, 1], 0.01);
  shaded(await coverage(page, along(250, 70, [5, 45, 55, 95])), [1, 1, 0, 0], 0.01);
  // With a spread, an edge is as soft as it says.
  shaded(await coverage(page, along(10, 130, [20, 30, 40, 50, 60, 70, 80])), [0, 0.03, 0.23, 0.51, 0.8, 0.98, 1], 0.04);
  shaded(await coverage(page, along(130, 130, [20, 30, 40, 50, 60, 70, 80])), [1, 0.97, 0.77, 0.49, 0.2, 0.02, 0], 0.04);
  shaded(await coverage(page, along(250, 130, [10, 20, 25, 30, 50, 80, 85, 90, 95])), [1, 0.88, 0.57, 0.21, 0, 0.12, 0.28, 0.46, 0.65], 0.04);
});

test("a mask is one of SVG's, and follows what the effect says", async ({ page }) => {
  await masks(page);
  const read = await page.evaluate(() => {
    const o = window.objects;
    const levels = () => o.round.$node.querySelector("feFuncA").getAttribute("tableValues").split(" ").slice(0, 3);
    const picture = (name) => {
      const element = o[name].$node.querySelector("mask").firstChild;
      return [element.localName, ...["href", "rx", "fill-opacity", "preserveAspectRatio"].map((each) => element.getAttribute(each))];
    };
    const before = [levels(), picture("round"), picture("small")];
    o.round.maskInverted = true;
    const inverted = levels();
    o.round.maskSource = o.pill;
    const other = picture("round");
    o.round.maskEnabled = false;
    return { before, inverted, other, mask: o.b0.$node.style.mask };
  });
  expect(read.before).toEqual([
    ["0", "1", "1"],
    ["image", "/assets/circle.png", null, null, "none"],
    ["rect", null, "0.5", "0.502", null],
  ]);
  expect(read.inverted).toEqual(["1", "0", "0"]);
  expect(read.other).toEqual(["rect", null, "0.5", "1", null]);
  expect(read.mask).toBe("");
  near(await colours(page, [[12, 12]]), [BLUE]);
});

// The box a shadow is: where it is in its item, and how CSS paints it.
const boxes = (page, names) =>
  page.evaluate(
    (names) =>
      names.map((name) => {
        const style = window.objects[name].$node.querySelector(".qq-shadow").style;
        return [
          [style.left, style.top, style.width, style.height].map(parseFloat),
          style.borderRadius,
          style.background,
          style.filter,
        ];
      }),
    names,
  );

test("a rectangular shadow starts as Qt's does", async ({ page }) => {
  await open(page, "shadows");
  const read = await page.evaluate(() => {
    const { none, corners } = window.objects;
    const radii = (shadow) => [shadow.topLeftRadius, shadow.topRightRadius, shadow.bottomLeftRadius, shadow.bottomRightRadius];
    return [
      [String(none.offset), String(none.color), none.blur, none.radius, none.spread, none.cached, none.width],
      radii(none),
      // A corner that was not given a radius reads as the one all have.
      radii(corners),
    ];
  });
  expect(read).toEqual([["QVector2D(0, 0)", "#000000", 10, 0, 0, false, 0], [0, 0, 0, 0], [0, 20, 20, 5]]);
});

test("a rectangular shadow is a box of its colour, grown, moved and blurred", async ({ page }) => {
  await open(page, "shadows");
  expect(await boxes(page, ["plain", "hard", "wide", "corners", "soft", "square", "big"])).toEqual([
    // Qt's edge is as soft as a blur by 0.42 of `blur`.
    [[0, 0, 60, 40], "", "black", "blur(4.2px)"],
    [[10, 5, 60, 40], "10px", "rgba(255, 0, 0, 0.5)", ""],
    // The spread is added to a round corner.
    [[-10, -10, 80, 60], "20px", "black", ""],
    [[0, 0, 60, 60], "0px 20px 5px", "black", ""],
    [[0, 0, 100, 100], "", "black", "blur(8.4px)"],
    // And a square one stays square.
    [[-10, -10, 80, 80], "", "black", ""],
    // No rounder than a circle.
    [[0, 0, 40, 40], "20px", "black", ""],
  ]);
  await page.evaluate(() => {
    const { plain, Qt } = window.objects;
    plain.blur = 0;
    plain.spread = 5;
    plain.offset = Qt.vector2d(-5, 5);
    plain.color = "#00ff00";
  });
  expect(await boxes(page, ["plain"])).toEqual([[[-10, 0, 70, 50], "", "rgb(0, 255, 0)", ""]]);
});

test("a rectangular shadow is painted as Qt paints it", async ({ page }) => {
  await open(page, "shadows");
  const read = await colours(page, [
    [150, 45],
    [115, 45],
    // The corner of what a spread of 10 made 20 round.
    [203, 23],
    [208, 28],
    [312, 22],
    [367, 77],
    [366, 22],
    [195, 145],
    [303, 153],
    [320, 170],
  ]);
  const black = [0, 0, 0];
  near(read, [[255, 128, 128], WHITE, WHITE, black, black, black, WHITE, black, WHITE, black]);
  // Across the left edge of a shadow blurred by 20, which is at 40.
  const across = [-16, -8, -4, 0, 3, 7, 11, 15].map((offset) => [40 + offset, 200]);
  shaded(await darkness(page, across), [0.024, 0.157, 0.286, 0.451, 0.588, 0.765, 0.914, 0.992], 0.1);
});

test("the effects of the examples are what the compiler's output makes", async ({ page }) => {
  await open(page, "effectcard");
  await page.waitForFunction(() => window.scene.mask.status === 1);
  expect(await page.evaluate(() => window.scene.card.$node.style.filter)).toBe(
    "drop-shadow(rgba(0, 0, 0, 0.5) 0px 0px 6.6257px)",
  );
  shaded(await darkness(page, [[80, 40], [84, 40]]), [0.224, 0.102], 0.04);
  near(await colours(page, [[50, 40], [140, 40], [220, 40], [202, 22]]), [WHITE, [44, 222, 133], BLUE, WHITE]);
});
