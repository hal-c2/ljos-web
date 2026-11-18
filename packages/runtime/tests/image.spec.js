import { expect, open, test } from "./open.js";
import { pixels } from "./pixels.js";

const RED = "255 0 0";
const GREEN = "0 255 0";
const BLUE = "0 0 255";
const WHITE = "255 255 255";
const BLACK = "0 0 0";
const YELLOW = "255 204 0";

// The scene, once every picture in it has arrived or failed.
async function pictures(page, scene = "image") {
  await open(page, scene);
  await page.waitForFunction(() => Object.values(window.objects).every((item) => item.status !== 2));
}

// How the picture is put in its item: the box it is painted in, and the
// size, place and repeating of the picture in that box.
const face = (page, name) =>
  page.evaluate((name) => {
    const style = window.objects[name].$face.style;
    const numbers = (text) => text.split(" ").map(parseFloat);
    return {
      box: [style.left, style.top, style.width, style.height].map(parseFloat),
      size: numbers(style.backgroundSize),
      at: numbers(style.backgroundPosition),
      repeat: style.backgroundRepeat,
    };
  }, name);

// What `qml6` prints for the scene: status, progress, width, height,
// implicitWidth, implicitHeight, paintedWidth, paintedHeight, and the width
// and height of sourceSize. flag.png is 40 by 20, disc.svg 60 by 30.
const QT = {
  stretch: [1, 1, 100, 100, 40, 20, 100, 100, 40, 20],
  fit: [1, 1, 100, 100, 40, 20, 100, 50, 40, 20],
  crop: [1, 1, 100, 100, 40, 20, 200, 100, 40, 20],
  tile: [1, 1, 100, 100, 40, 20, 100, 100, 40, 20],
  tileV: [1, 1, 100, 100, 40, 20, 100, 100, 40, 20],
  tileH: [1, 1, 100, 100, 40, 20, 100, 100, 40, 20],
  pad: [1, 1, 100, 100, 40, 20, 40, 20, 40, 20],
  corner: [1, 1, 100, 100, 40, 20, 40, 20, 40, 20],
  plain: [1, 1, 40, 20, 40, 20, 40, 20, 40, 20],
  mirrored: [1, 1, 40, 20, 40, 20, 40, 20, 40, 20],
  small: [1, 1, 20, 10, 20, 10, 20, 10, 20, 0],
  blocky: [1, 1, 80, 40, 40, 20, 80, 40, 40, 20],
  wide: [1, 1, 100, 20, 40, 20, 40, 20, 40, 20],
  vector: [1, 1, 120, 60, 120, 60, 120, 60, 120, 0],
  drawn: [1, 1, 60, 30, 60, 30, 60, 30, 60, 30],
  packed: [1, 1, 60, 30, 60, 30, 60, 30, 60, 30],
  misnamed: [1, 1, 40, 20, 40, 20, 40, 20, 40, 20],
  misnamedWide: [1, 1, 40, 20, 40, 20, 40, 20, 120, 0],
  broken: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  none: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

const sizes = (page, names) =>
  page.evaluate(
    (names) =>
      Object.fromEntries(
        names.map((name) => {
          const { status, progress, width, height, implicitWidth, implicitHeight, paintedWidth, paintedHeight, sourceSize } =
            window.objects[name];
          return [
            name,
            [
              status,
              progress,
              width,
              height,
              implicitWidth,
              implicitHeight,
              paintedWidth,
              paintedHeight,
              sourceSize.width,
              sourceSize.height,
            ],
          ];
        }),
      ),
    names,
  );

test("a picture gives its item the sizes Qt gives it", async ({ page }) => {
  await pictures(page);
  expect(await sizes(page, Object.keys(QT))).toEqual(QT);
  const frame = await page.evaluate(() => {
    const { status, progress, width, height, implicitWidth, implicitHeight, sourceSize } = window.objects.frame;
    return [status, progress, width, height, implicitWidth, implicitHeight, sourceSize.width, sourceSize.height];
  });
  expect(frame).toEqual([1, 1, 100, 60, 30, 30, 30, 30]);
});

test("a drawing is as big as QtSvg makes the file", async ({ page }) => {
  await open(page, "drawings");
  await page.waitForFunction(() => !window.scene.loading());
  // Qt 6.11: status, implicit size and sourceSize of each.
  expect(await page.evaluate(() => window.scene.sizes())).toEqual({
    // `1in` by `0.5in`: an inch is 90.
    a: [1, 90, 45, 90, 45],
    // `10mm` by `2cm`, cut down to whole numbers.
    b: [1, 35, 70, 35, 70],
    // `50%` by `200%` of a `viewBox` 40.6 by 20.5.
    c: [1, 20, 41, 20, 41],
    // A width and no height: the `viewBox`, rounded.
    d: [1, 41, 21, 41, 21],
    // `12pt` by `2pc` count as they are written.
    e: [1, 12, 2, 12, 2],
    // 33.7 by 10.2.
    f: [1, 33, 10, 33, 10],
    // `2em` is no size: the `viewBox`.
    h: [1, 10, 30, 10, 30],
    // Only a `viewBox`.
    box: [1, 41, 21, 41, 21],
  });
  // Asked for at a width, and in an item wider than it.
  expect(await page.evaluate(() => window.scene.scaled())).toEqual([
    [100, 51, 100, 51, 100, 0, 100, 51],
    [120, 21, 41, 21, 41, 21, 120, 21],
  ]);
});

test("each fill mode puts the picture where Qt paints it", async ({ page }) => {
  await pictures(page);
  expect(await face(page, "stretch")).toEqual({ box: [0, 0, 100, 100], size: [100, 100], at: [0, 0], repeat: "no-repeat" });
  expect(await face(page, "fit")).toEqual({ box: [0, 25, 100, 50], size: [100, 50], at: [0, 0], repeat: "no-repeat" });
  // Cut on both sides: the item is the window.
  expect(await face(page, "crop")).toEqual({ box: [0, 0, 100, 100], size: [200, 100], at: [-50, 0], repeat: "no-repeat" });
  // Tiles are laid from the one in the middle.
  expect(await face(page, "tile")).toEqual({ box: [0, 0, 100, 100], size: [40, 20], at: [30, 40], repeat: "repeat" });
  expect(await face(page, "tileV")).toEqual({ box: [0, 0, 100, 100], size: [100, 20], at: [0, 40], repeat: "repeat-y" });
  expect(await face(page, "tileH")).toEqual({ box: [0, 0, 100, 100], size: [40, 100], at: [30, 0], repeat: "repeat-x" });
  expect(await face(page, "pad")).toEqual({ box: [30, 40, 40, 20], size: [40, 20], at: [0, 0], repeat: "no-repeat" });
  expect(await face(page, "corner")).toEqual({ box: [0, 80, 40, 20], size: [40, 20], at: [0, 0], repeat: "no-repeat" });
  expect(await face(page, "wide")).toEqual({ box: [30, 0, 40, 20], size: [40, 20], at: [0, 0], repeat: "no-repeat" });
  const points = {
    // Stretched: red on the left, blue on the right, the green corner.
    stretch: [
      [25, 50],
      [75, 50],
      [5, 5],
      [20, 50],
    ],
    // Fitted: nothing above it.
    fit: [
      [125, 10],
      [125, 50],
      [175, 50],
      [125, 90],
    ],
    // Cropped: the middle half of the picture, the corner cut away.
    crop: [
      [225, 50],
      [275, 50],
      [205, 5],
    ],
    // Tiled: the middle tile starts at 30, 40, and the one left of it is cut.
    tile: [
      [332, 42],
      [345, 45],
      [360, 45],
      [305, 45],
      [325, 45],
      [332, 22],
      [332, 2],
    ],
    tileV: [
      [25, 145],
      [75, 145],
      [3, 141],
      [3, 121],
      [25, 105],
    ],
    tileH: [
      [135, 150],
      [160, 150],
      [105, 150],
      [125, 150],
      [131, 110],
      [171, 110],
    ],
    pad: [
      [240, 150],
      [260, 150],
      [232, 142],
      [220, 150],
      [250, 130],
    ],
    corner: [
      [310, 190],
      [330, 190],
      [302, 182],
      [350, 190],
      [310, 170],
    ],
  };
  const read = await pixels(page, Object.values(points).flat());
  const seen = {};
  let next = 0;
  for (const [name, list] of Object.entries(points)) seen[name] = read.slice(next, (next += list.length));
  expect(seen).toEqual({
    stretch: [RED, BLUE, GREEN, RED],
    fit: [WHITE, RED, BLUE, WHITE],
    crop: [RED, BLUE, RED],
    tile: [GREEN, RED, BLUE, RED, BLUE, GREEN, GREEN],
    tileV: [RED, BLUE, GREEN, GREEN, RED],
    tileH: [RED, BLUE, RED, BLUE, GREEN, GREEN],
    pad: [RED, BLUE, GREEN, WHITE, WHITE],
    corner: [RED, BLUE, GREEN, WHITE, WHITE],
  });
});

test("a picture is mirrored, scaled down, and smoothed or not", async ({ page }) => {
  await pictures(page);
  const read = await pixels(page, [
    // As it is: red, blue, the corner on the left.
    [10, 215],
    [30, 215],
    [2, 202],
    // Mirrored: the corner is on the right.
    [60, 215],
    [80, 215],
    [87, 202],
    [52, 202],
    // Loaded at half its size.
    [103, 207],
    [117, 207],
    [101, 201],
    [125, 205],
    // Twice its size and not smoothed: the colours meet on a pixel.
    [169, 230],
    [170, 230],
    [139, 209],
    [140, 209],
    [139, 210],
    // Fitted in a wider item: in the middle of it.
    [230, 210],
    [260, 215],
    [280, 215],
    [300, 210],
  ]);
  expect(read).toEqual([
    RED,
    BLUE,
    GREEN,
    BLUE,
    RED,
    GREEN,
    BLUE,
    RED,
    BLUE,
    GREEN,
    WHITE,
    RED,
    BLUE,
    GREEN,
    RED,
    RED,
    WHITE,
    RED,
    BLUE,
    WHITE,
  ]);
  const look = await page.evaluate(() => {
    const { plain, mirrored, blocky } = window.objects;
    return [plain, mirrored, blocky].map((item) => [item.$face.style.transform, item.$face.style.imageRendering]);
  });
  expect(look).toEqual([
    ["", ""],
    ["scale(-1, 1)", ""],
    ["", "pixelated"],
  ]);
  const turned = await page.evaluate(() => {
    const { plain } = window.objects;
    plain.mirrorVertically = true;
    plain.smooth = false;
    window.flush();
    return [plain.$face.style.transform, plain.$face.style.imageRendering];
  });
  expect(turned).toEqual(["scale(1, -1)", "pixelated"]);
  // The corner went to the bottom.
  expect(
    await pixels(page, [
      [2, 202],
      [2, 217],
    ]),
  ).toEqual([RED, GREEN]);
});

test("a drawing is painted at the size asked for", async ({ page }) => {
  await pictures(page);
  // The disc is a third of the way in, 20 across at its own size and 40 at twice that.
  const read = await pixels(page, [
    [30, 260],
    [30, 242],
    [30, 278],
    [12, 260],
    [48, 260],
    [30, 237],
    [100, 260],
    [145, 265],
    [145, 257],
    [145, 253],
    [180, 265],
  ]);
  expect(read).toEqual([BLUE, BLUE, BLUE, BLUE, BLUE, YELLOW, YELLOW, BLUE, BLUE, YELLOW, YELLOW]);
  // Both sides given: a drawing takes them, a picture keeps its shape and is
  // never made larger.
  const read2 = await page.evaluate(() => {
    const { vector, small } = window.objects;
    vector.sourceSize.height = 30;
    small.sourceSize.height = 4;
    window.flush();
    const first = [vector.width, vector.height, vector.sourceSize.width, vector.sourceSize.height, small.width, small.height];
    small.sourceSize.width = 400;
    small.sourceSize.height = 400;
    window.flush();
    return [first, [small.width, small.height, small.sourceSize.width, small.sourceSize.height]];
  });
  expect(read2).toEqual([
    [120, 30, 120, 30, 8, 4],
    [40, 20, 400, 400],
  ]);
  // And is stretched to them: the disc is twice as wide as it is tall.
  const stretched = await pixels(page, [
    [5, 245],
    [12, 245],
    [48, 245],
    [115, 245],
    [30, 233],
    [30, 237],
  ]);
  expect(stretched).toEqual([YELLOW, BLUE, BLUE, YELLOW, YELLOW, BLUE]);
});

test("a compressed drawing is opened and painted", async ({ page }) => {
  await pictures(page);
  // The server does not say that it is compressed, as most do not.
  const read = await pixels(page, [
    [345, 215],
    [380, 215],
  ]);
  expect(read).toEqual([BLUE, YELLOW]);
});

// The server says it is a drawing, going by its name; Qt goes by what is in
// the file, and shows the picture.
test("a picture under a drawing's name is painted as the picture it is", async ({ page }) => {
  await pictures(page);
  const read = await pixels(page, [
    [365, 265],
    [385, 265],
    [365, 290],
    [385, 290],
  ]);
  expect(read).toEqual([RED, BLUE, RED, BLUE]);
});

test("a picture that changes is loaded and laid out again", async ({ page }) => {
  await pictures(page);
  const loading = await page.evaluate(() => {
    const { plain } = window.objects;
    plain.source = "/assets/frame.png?again";
    window.flush();
    return [plain.status, plain.progress, plain.$face.style.display];
  });
  expect(loading).toEqual([2, 0, "none"]);
  await page.waitForFunction(() => window.objects.plain.status === 1);
  expect(await sizes(page, ["plain"])).toEqual({ plain: [1, 1, 30, 30, 30, 30, 30, 30, 30, 30] });
  // What others have loaded is there at once.
  const again = await page.evaluate(() => {
    const { plain } = window.objects;
    plain.source = "/assets/flag.png";
    plain.fillMode = 1;
    plain.width = 90;
    window.flush();
    return plain.status;
  });
  expect(again).toBe(1);
  // Fitted, with a width and no height: Qt fits it in the width given and
  // the height of the picture, and the item is as high as what is painted.
  expect(await sizes(page, ["plain"])).toEqual({ plain: [1, 1, 90, 20, 40, 20, 40, 20, 40, 20] });
  expect(await face(page, "plain")).toEqual({ box: [25, 0, 40, 20], size: [40, 20], at: [0, 0], repeat: "no-repeat" });
  const narrow = await page.evaluate(() => {
    const { plain } = window.objects;
    plain.width = 30;
    window.flush();
    return [plain.width, plain.height, plain.implicitWidth, plain.implicitHeight, plain.paintedWidth, plain.paintedHeight];
  });
  expect(narrow).toEqual([30, 15, 40, 15, 30, 15]);
  const modes = await page.evaluate(() => {
    const { fit } = window.objects;
    const out = [];
    for (const [mode, across, down] of [
      [1, 1, 32],
      [1, 2, 64],
      [2, 1, 128],
      [2, 2, 128],
      [6, 2, 64],
      [3, 1, 32],
    ]) {
      fit.fillMode = mode;
      fit.horizontalAlignment = across;
      fit.verticalAlignment = down;
      window.flush();
      const style = fit.$face.style;
      out.push(
        [style.left, style.top, style.width, style.height, style.backgroundPosition, fit.paintedWidth, fit.paintedHeight].join(
          " ",
        ),
      );
    }
    return out;
  });
  expect(modes).toEqual([
    "0px 0px 100px 50px 0px 0px 100 50",
    "0px 50px 100px 50px 0px 0px 100 50",
    "0px 0px 100px 100px 0px 0px 200 100",
    "0px 0px 100px 100px -100px 0px 200 100",
    "60px 80px 40px 20px 0px 0px 40 20",
    "0px 0px 100px 100px 0px 0px 100 100",
  ]);
  const gone = await page.evaluate(() => {
    const { plain, fit } = window.objects;
    plain.source = "";
    fit.source = "data:image/png;base64,AAAA";
    window.flush();
    return [plain.status, plain.implicitWidth, plain.$face.style.display, fit.status];
  });
  expect(gone).toEqual([0, 0, "none", 2]);
  await page.waitForFunction(() => window.objects.fit.status === 3);
  // Nothing to paint, in the whole of the item, which is what a tiled picture takes.
  expect(await sizes(page, ["fit"])).toEqual({ fit: [3, 0, 100, 100, 0, 0, 100, 100, 0, 0] });
  expect(await pixels(page, [[125, 50]])).toEqual([WHITE]);
});

test("a BorderImage keeps its corners and stretches the rest", async ({ page }) => {
  await pictures(page);
  // The picture is black, 30 across, with a white middle of 10: at 100 by 60
  // the border is still 10 and the middle is all the rest.
  const at = (x, y) => [250 + x, 230 + y];
  const read = await pixels(page, [
    at(5, 5),
    at(95, 55),
    at(50, 5),
    at(5, 30),
    at(12, 12),
    at(50, 30),
    at(88, 48),
    at(92, 30),
    at(50, 52),
  ]);
  expect(read).toEqual([BLACK, BLACK, BLACK, BLACK, WHITE, WHITE, WHITE, BLACK, BLACK]);
  const wider = await page.evaluate(() => {
    const { frame } = window.objects;
    frame.border.left = 5;
    frame.horizontalTileMode = 1;
    frame.verticalTileMode = 2;
    window.flush();
    const style = frame.$face.style;
    return [style.borderWidth, style.borderImageSlice, style.borderImageRepeat];
  });
  expect(wider).toEqual(["10px 10px 10px 5px", "10 10 10 5 fill", "repeat round"]);
  expect(await pixels(page, [at(2, 30), at(50, 5), at(95, 30)])).toEqual([BLACK, BLACK, BLACK]);
});

// status, frameCount, width, height, implicitWidth, implicitHeight, playing,
// paused, as `qml6` prints them: blink.gif is 10 by 10 and has three frames,
// red, green and blue, a tenth of a second each.
const QT_ANIMATED = {
  blink: [1, 3, 10, 10, 10, 10, true, false],
  stopped: [1, 3, 10, 10, 10, 10, false, false],
  held: [1, 3, 10, 10, 10, 10, true, true],
  large: [1, 3, 40, 40, 10, 10, true, false],
  none: [0, 0, 0, 0, 0, 0, true, false],
};

const frame = (page) =>
  page.evaluate(() => ["blink", "stopped", "held", "large", "none"].map((name) => window.objects[name].currentFrame));

// One point in each of the four that have a picture.
const shown = (page) =>
  pixels(page, [
    [5, 5],
    [25, 5],
    [45, 5],
    [80, 20],
  ]);

test("an AnimatedImage shows its frames as time passes", async ({ page }) => {
  await open(page, "animatedimage");
  await page.waitForFunction(() => ["blink", "stopped", "held", "large"].every((name) => window.objects[name].status === 1));
  const read = await page.evaluate(
    (names) =>
      Object.fromEntries(
        names.map((name) => {
          const { status, frameCount, width, height, implicitWidth, implicitHeight, playing, paused } = window.objects[name];
          return [name, [status, frameCount, width, height, implicitWidth, implicitHeight, playing, paused]];
        }),
      ),
    Object.keys(QT_ANIMATED),
  );
  expect(read).toEqual(QT_ANIMATED);
  expect(await frame(page)).toEqual([0, 0, 0, 0, 0]);
  expect(await shown(page)).toEqual([RED, RED, RED, RED]);
  // A tenth of a second: one frame on, two at twice the speed, none for the
  // one that is stopped and the one that is paused.
  await page.evaluate(() => window.objects.clock.advance(100));
  expect(await frame(page)).toEqual([1, 0, 0, 2, 0]);
  expect(await shown(page)).toEqual([GREEN, RED, RED, BLUE]);
  // Less than a frame is kept for the next time.
  await page.evaluate(() => window.objects.clock.advance(60));
  expect(await frame(page)).toEqual([1, 0, 0, 0, 0]);
  await page.evaluate(() => window.objects.clock.advance(40));
  expect(await frame(page)).toEqual([2, 0, 0, 1, 0]);
  expect(await shown(page)).toEqual([BLUE, RED, RED, GREEN]);
  // And round again.
  await page.evaluate(() => window.objects.clock.advance(100));
  expect(await frame(page)).toEqual([0, 0, 0, 0, 0]);
});

test("an AnimatedImage is paused, stopped and set on a frame", async ({ page }) => {
  await open(page, "animatedimage");
  await page.waitForFunction(() => ["blink", "stopped", "held", "large"].every((name) => window.objects[name].status === 1));
  await page.evaluate(() => {
    const { held, stopped, blink, clock } = window.objects;
    held.paused = false;
    stopped.currentFrame = 2;
    window.flush();
    clock.advance(100);
    blink.paused = true;
    window.flush();
    clock.advance(100);
  });
  // The one let go moves; the stopped one stays where it was put; the one
  // paused after a frame stays on that frame.
  expect(await frame(page)).toEqual([1, 2, 2, 1, 0]);
  expect(await shown(page)).toEqual([GREEN, BLUE, BLUE, GREEN]);
  await page.evaluate(() => {
    const { held, stopped, blink, clock } = window.objects;
    blink.paused = false;
    held.playing = false;
    stopped.playing = true;
    window.flush();
    clock.advance(100);
  });
  // Paused, it goes on from where it was; started, it starts from the first frame.
  expect(await frame(page)).toEqual([2, 1, 2, 0, 0]);
  await page.evaluate(() => {
    const { held, clock } = window.objects;
    held.playing = true;
    window.flush();
    clock.advance(100);
  });
  expect(await frame(page)).toEqual([0, 2, 1, 2, 0]);
});

// What Qt 6.11 answers for the same scene: which of the pictures are there
// (1) and which are not (3), then each one's size and its `sourceSize`.
test("a path and a group given through an alias are the aliased object's, and a picture is loaded at Qt's size", async ({ page }) => {
  await open(page, "aliased");
  const answers = () => page.evaluate(() => JSON.parse(JSON.stringify(window.scene.answers())));
  await expect.poll(async () => (await answers())[0]).toEqual([1, 3, 1, 3]);
  await expect.poll(answers).toEqual([
    [1, 3, 1, 3],
    [1, 40, 20, 40, 20],
    [1, 10, 5, 10, 10],
    [1, 20, 10, 10, 10],
    [100, 20, 100, 20],
    [100, 50, 100, 20],
    [100, 50, 100, 20],
    [200, 100, 20, 100],
    [100, 50, 100, 0],
    [100, 20, 100, 20],
    [10, 5, 30, 5],
    [30, 15, 30, 5],
    [30, 15, 30, 5],
    [400, 200, 400, 5],
    [600, 300, 400, 300],
    [40, 20, 400, 300],
    [10, 5, 400, 5],
  ]);
});

test("a source a block works out is beside the file as one that is written", async ({ page }) => {
  await open(page, "worked");
  // `Image.Ready`.
  await expect.poll(() => page.evaluate(() => window.scene.read())).toEqual([1, true, true]);
});

// What takes a picture of a scene waits for `busy()` to be 0: a picture still
// on its way counts, or the scene is pictured without it. The picture held
// is one the page fetches: a small one the scene imports is inlined, and is
// never on its way long enough to be held. The page is opened without waiting
// for `load`, which a picture on its way holds back.
test("a picture on its way keeps the scene busy until it is there", async ({ page }) => {
  let arrive;
  const arrived = new Promise((resolve) => (arrive = resolve));
  let held = 0;
  await page.route("**/assets/flag.png*", async (route) => {
    held++;
    await arrived;
    await route.continue();
  });
  await page.goto("/?scene=image", { waitUntil: "commit" });
  await page.waitForFunction(() => window.ready);
  await expect.poll(() => held).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.busy())).toBeGreaterThan(0);
  arrive();
  await page.waitForFunction(() => window.busy() === 0);
});
