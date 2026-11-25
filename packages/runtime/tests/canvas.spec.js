// Canvas. The scene stops the clock: a frame passes when the test says so.
// The colours shapes and gradients are compared with are what Qt 6 paints
// for the same calls.
import { expect, open, test } from "./open.js";
import { pixels } from "./pixels.js";

const frame = (page, frames = 1) =>
  page.evaluate((frames) => {
    for (let each = 0; each < frames; each++) window.objects.clock.advance(16);
  }, frames);

// What was logged since last asked. When the picture arrives is not ours to
// say: the test that is about it waits for it.
const logged = async (page) =>
  (await page.evaluate(() => window.objects.log.splice(0))).filter((line) => line !== "loaded");

// Points of a canvas: red, green, blue, alpha. Read from a copy, which is
// made to be read from: the browser warns of reading a canvas often.
const read = (page, name, points) =>
  page.evaluate(
    ([name, points]) => {
      const element = window.objects[name].$node.querySelector("canvas");
      const copy = new OffscreenCanvas(element.width, element.height).getContext("2d", { willReadFrequently: true });
      copy.drawImage(element, 0, 0);
      return points.map(([x, y]) => Array.from(copy.getImageData(x, y, 1, 1).data));
    },
    [name, points],
  );

function near(colours, wanted, slack = 2) {
  expect(colours.length).toBe(wanted.length);
  colours.forEach((colour, index) => {
    const off = Math.max(...wanted[index].map((channel, each) => Math.abs(channel - colour[each])));
    expect(off, `point ${index}: ${colour} for ${wanted[index]}`).toBeLessThanOrEqual(slack);
  });
}

const CLEAR = [0, 0, 0, 0];
const GREY = [137, 137, 137, 255];

test("a canvas is painted at the first frame, and not again", async ({ page }) => {
  await open(page, "canvas");
  expect(await logged(page)).toEqual([]);
  await frame(page);
  // One that is hidden too, as in Qt; one that has no size is not.
  expect(await logged(page)).toEqual([
    "arrow QRect(0, 0, 12, 8)",
    "arrow painted",
    "plain QRect(0, 0, 60, 40)",
    "hidden QRect(0, 0, 20, 20)",
  ]);
  await frame(page, 3);
  expect(await logged(page)).toEqual([]);
  near(
    await read(page, "arrow", [
      [6, 2],
      [1, 6],
      [10, 6],
    ]),
    [GREY, CLEAR, CLEAR],
  );
  near(
    await read(page, "plain", [
      [2, 2],
      [20, 20],
    ]),
    [
      [255, 0, 0, 128],
      [0, 0, 255, 255],
    ],
  );
  // And it is on the page where the item is.
  const shot = (await pixels(page, [[16, 12], [42, 12], [60, 30], [20, 110]])).map((colour) => colour.split(" ").map(Number));
  near(shot, [GREY.slice(0, 3), [255, 128, 128], [0, 0, 255], [255, 255, 255]]);
});

test("however often it is asked, a canvas is painted once a frame", async ({ page }) => {
  await open(page, "canvas");
  await frame(page);
  await logged(page);
  await page.evaluate(() => {
    const { root, arrow } = window.objects;
    root.tint = "#ff0000";
    arrow.requestPaint();
    arrow.requestPaint();
    arrow.requestPaint();
  });
  // Not before the frame.
  expect(await logged(page)).toEqual([]);
  near(await read(page, "arrow", [[6, 2]]), [GREY]);
  await frame(page);
  expect(await logged(page)).toEqual(["arrow QRect(0, 0, 12, 8)", "arrow painted"]);
  near(await read(page, "arrow", [[6, 2]]), [[255, 0, 0, 255]]);
  await frame(page);
  expect(await logged(page)).toEqual([]);
});

test("what is to be painted is the rectangle around all that was marked", async ({ page }) => {
  await open(page, "canvas");
  await frame(page);
  await logged(page);
  await page.evaluate(() => {
    const { Qt, plain, hidden } = window.objects;
    plain.markDirty(Qt.rect(5, 5, 10, 10));
    plain.markDirty(Qt.rect(20, 20, 100, 100));
    // Nothing: no more than there was.
    plain.markDirty(Qt.rect(200, 200, 0, 10));
    hidden.markDirty(Qt.rect(1.5, 2.5, 3.2, 4));
  });
  await frame(page);
  expect(await logged(page)).toEqual(["plain QRect(5, 5, 115, 115)", "hidden QRect(1, 2, 4, 4)"]);
});

test("painting asked for while painting is done at the frame after", async ({ page }) => {
  await open(page, "canvas");
  await frame(page);
  await logged(page);
  await page.evaluate(() => {
    window.objects.root.more = 2;
    window.objects.plain.requestPaint();
  });
  const seen = [];
  for (let each = 0; each < 5; each++) {
    await frame(page);
    seen.push((await logged(page)).length);
  }
  expect(seen).toEqual([1, 1, 1, 0, 0]);
});

test("a canvas of another size is painted again", async ({ page }) => {
  await open(page, "canvas");
  await frame(page);
  await logged(page);
  const sizes = await page.evaluate(() => {
    const { arrow, empty } = window.objects;
    arrow.width = 24;
    empty.width = 20;
    empty.height = 10;
    const element = arrow.$node.querySelector("canvas");
    return [element.width, element.height, String(arrow.canvasSize), String(arrow.canvasWindow), String(empty.canvasSize)];
  });
  expect(sizes).toEqual([24, 8, "QSizeF(24, 8)", "QRectF(0, 0, 24, 8)", "QSizeF(20, 10)"]);
  await frame(page);
  // Nothing was drawn on the one that had no size: it says nothing of it.
  expect(await logged(page)).toEqual(["arrow QRect(0, 0, 24, 8)", "arrow painted", "empty QRect(0, 0, 20, 10)"]);
  near(
    await read(page, "arrow", [
      [12, 2],
      [18, 2],
      [2, 6],
    ]),
    [GREY, GREY, CLEAR],
  );
});

test("the context is the one there is, made when it is asked for", async ({ page }) => {
  await open(page, "canvas");
  const read = await page.evaluate(() => {
    const { arrow, still } = window.objects;
    const before = [typeof arrow.context, arrow.contextType, typeof still.context, still.contextType];
    const context = still.getContext("2d");
    return {
      before,
      after: [still.context === context, still.contextType, still.getContext("2d") === context, context.canvas === still],
      starts: [
        context.fillStyle,
        context.strokeStyle,
        context.lineWidth,
        context.globalAlpha,
        context.textAlign,
        context.textBaseline,
        context.lineCap,
        context.lineJoin,
        context.miterLimit,
        context.globalCompositeOperation,
        context.fillRule,
      ],
      item: [still.available, still.renderTarget, still.renderStrategy, still.implicitWidth, still.save("x.png")],
      url: still.toDataURL().slice(0, 22),
    };
  });
  expect(read.before).toEqual(["object", "2d", "undefined", ""]);
  expect(read.after).toEqual([true, "2d", true, true]);
  expect(read.starts).toEqual(["#000000", "#000000", 1, 1, "start", "alphabetic", "butt", "miter", 10, "source-over", 1]);
  expect(read.item).toEqual([true, 0, 0, 0, false]);
  expect(read.url).toBe("data:image/png;base64,");
});

test("a colour is QML's, and what returns nothing returns the context", async ({ page }) => {
  await open(page, "canvas");
  const read = await page.evaluate(() => {
    const { Qt, still } = window.objects;
    const context = still.getContext("2d");
    const colours = [];
    for (const colour of ["red", "#80112233", Qt.rgba(1, 0, 0, 0.5), "nonsense"]) {
      context.fillStyle = colour;
      colours.push(context.fillStyle);
    }
    context.strokeStyle = "blue";
    context.shadowColor = "green";
    colours.push(context.strokeStyle, context.shadowColor);
    const chained = [
      context.beginPath() === context,
      context.rect(0, 0, 1, 1) === context,
      context.fill() === context,
      context.fillRect(0, 0, 1, 1) === context,
      context.save() === context,
      context.restore() === context,
      context.reset() === context,
    ];
    const gradient = context.createLinearGradient(0, 0, 10, 0);
    chained.push(gradient.addColorStop(0, "red") === gradient);
    context.fillStyle = gradient;
    chained.push(context.fillStyle === gradient);
    // The rule a path is filled by is part of what is saved.
    const rules = [];
    context.fillRule = Qt.OddEvenFill;
    context.save();
    context.fillRule = Qt.WindingFill;
    rules.push(context.fillRule);
    context.restore();
    rules.push(context.fillRule);
    context.reset();
    rules.push(context.fillRule);
    return { colours, chained, rules };
  });
  expect(read.colours).toEqual([
    "#ff0000",
    // #AARRGGBB.
    "rgba(17, 34, 51, 0.5)",
    "rgba(255, 0, 0, 0.5)",
    "rgba(255, 0, 0, 0.5)",
    "#0000ff",
    "#008000",
  ]);
  expect(read.chained).toEqual(Array(9).fill(true));
  expect(read.rules).toEqual([1, 0, 1]);
});

test("what is drawn between paints is said to be painted at the next frame", async ({ page }) => {
  await open(page, "canvas");
  await frame(page);
  await logged(page);
  const seen = await page.evaluate(() => {
    const { still, log } = window.objects;
    still.painted.connect(() => log.push("still painted"));
    const context = still.getContext("2d");
    context.fillStyle = "blue";
    context.fillRect(0, 0, 10, 10);
    context.fillRect(10, 10, 10, 10);
    // Reading is not drawing.
    return Array.from(context.getImageData(5, 5, 1, 1).data);
  });
  expect(seen).toEqual([0, 0, 255, 255]);
  expect(await logged(page)).toEqual([]);
  await frame(page);
  expect(await logged(page)).toEqual(["still painted"]);
  await frame(page);
  expect(await logged(page)).toEqual([]);
  near(await read(page, "still", [[5, 5], [15, 5]]), [[0, 0, 255, 255], CLEAR]);
});

test("Qt's shapes are drawn as Qt draws them", async ({ page }) => {
  await open(page, "canvas");
  await frame(page);
  const points = [
    // A square in a square, filled by the odd-even rule: a frame.
    [5, 5],
    [20, 20],
    // An ellipse by its rectangle, not joined to where the path was.
    [70, 10],
    [52, 2],
    [51, 10],
    [70, 1],
    [70, 20],
    [49, 52],
    // A rectangle with corners 10 wide and 5 high.
    [70, 40],
    [51, 31],
    [53, 32],
    [60, 31],
    [20, 50],
    [20, 48],
  ];
  const blue = [51, 102, 153, 255];
  const green = [0, 128, 0, 255];
  const red = [255, 0, 0, 128];
  near(await read(page, "shapes", points), [
    blue,
    CLEAR,
    green,
    CLEAR,
    green,
    green,
    CLEAR,
    CLEAR,
    red,
    CLEAR,
    red,
    red,
    [0, 0, 0, 255],
    CLEAR,
  ]);
});

test("gradients are Qt's, the conical one going round as Qt's does", async ({ page }) => {
  await open(page, "canvas");
  await frame(page);
  const points = [
    [1, 10],
    [50, 10],
    [99, 10],
    // From three o'clock, against the clock.
    [75, 48],
    [50, 25],
    [25, 50],
    [50, 75],
    [75, 52],
    [10, 50],
    [18, 50],
  ];
  const wanted = [
    [251, 0, 4],
    [126, 0, 129],
    [1, 0, 254],
    [245, 10, 0],
    [4, 251, 0],
    [2, 2, 255],
    [128, 128, 255],
    [250, 250, 255],
    [18, 18, 18],
    [217, 217, 217],
  ];
  near(await read(page, "gradients", points), wanted, 10);
});

test("a frame's callbacks run before anything is painted", async ({ page }) => {
  await open(page, "canvas");
  await frame(page);
  await logged(page);
  const handles = await page.evaluate(() => {
    const { still, log } = window.objects;
    still.paint.connect((region) => log.push(`still ${region}`));
    const first = still.requestAnimationFrame((time) => {
      log.push(`frame ${typeof time}`);
      still.requestPaint();
    });
    const second = still.requestAnimationFrame(() => log.push("cancelled"));
    still.cancelRequestAnimationFrame(second);
    return [first, second];
  });
  expect(handles).toEqual([1, 2]);
  await frame(page);
  expect(await logged(page)).toEqual(["frame number"]);
  await frame(page);
  expect(await logged(page)).toEqual(["still QRect(0, 0, 20, 20)"]);
  await frame(page);
  expect(await logged(page)).toEqual([]);
});

test("a picture is drawn once it has been loaded", async ({ page }) => {
  await open(page, "canvas");
  const url = "/assets/circle.png";
  await page.waitForFunction((url) => window.objects.picture.isImageLoaded(url), url);
  expect(await page.evaluate(() => window.objects.log.includes("loaded"))).toBe(true);
  await frame(page, 2);
  near(await read(page, "picture", [[25, 25], [2, 2]]), [
    [255, 255, 255, 255],
    [51, 102, 153, 255],
  ]);
  const states = await page.evaluate((url) => {
    const { picture } = window.objects;
    const read = [picture.isImageLoading(url), picture.isImageError(url), picture.isImageLoaded("/assets/none.png")];
    picture.unloadImage(url);
    read.push(picture.isImageLoaded(url));
    return read;
  }, url);
  expect(states).toEqual([false, false, false, false]);
  // Unloaded, it is not drawn.
  await page.evaluate(() => window.objects.picture.requestPaint());
  await frame(page);
  near(await read(page, "picture", [[25, 25]]), [[51, 102, 153, 255]]);
});

test("a canvas the compiler made is painted by the browser's frames", async ({ page }) => {
  await open(page, "canvasarrow");
  const middle = async () => (await pixels(page, [[26, 22]]))[0];
  await expect.poll(middle).toBe("137 137 137");
  await page.evaluate(() => (window.scene.pressed = true));
  await expect.poll(middle).toBe("255 0 0");
});

test("a canvas that is not smooth is drawn pixelated when scaled", async ({ page }) => {
  await open(page, "canvassmooth");
  // Either side of where red meets blue, a pixel in from it: smoothed, the
  // colours run into each other there; not, each stays as it was drawn.
  const edges = () => pixels(page, [[37, 40], [42, 40], [137, 40], [142, 40]]);
  await expect.poll(async () => (await edges())[2]).toBe("255 0 0");
  const [softRed, softBlue, sharpRed, sharpBlue] = await edges();
  expect([sharpRed, sharpBlue]).toEqual(["255 0 0", "0 0 255"]);
  expect(softRed).not.toBe("255 0 0");
  expect(softBlue).not.toBe("0 0 255");
  // And it follows the property.
  const rendering = () => page.evaluate(() => window.scene.sharp.$node.querySelector("canvas").style.imageRendering);
  expect(await rendering()).toBe("pixelated");
  await page.evaluate(() => (window.scene.sharp.smooth = true));
  expect(await rendering()).toBe("");
});
