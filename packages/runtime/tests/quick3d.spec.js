import { expect, open, test } from "./open.js";
import { pixels } from "./pixels.js";

// Qt's numbers are single precision, rounded to three places.
function near(actual, expected, path = "", within = 0.006) {
  if (typeof expected === "number") expect(Math.abs(actual - expected), `${path}: ${actual} for ${expected}`).toBeLessThan(within);
  else if (Array.isArray(expected)) {
    expect(actual, path).toHaveLength(expected.length);
    expected.forEach((value, index) => near(actual[index], value, `${path}[${index}]`, within));
  } else if (expected && typeof expected === "object") {
    for (const [key, value] of Object.entries(expected)) near(actual[key], value, `${path}.${key}`, within);
  } else expect(actual, path).toBe(expected);
}

test("a node in space is where Qt has it, and a camera sees it there", async ({ page }) => {
  await open(page, "node3d");
  near(await page.evaluate(() => window.scene.read()), {
    outer: [85.858, 20, -15.858],
    inner: [118.371, 22.321, 2.513],
    cube: [-51.334, 22.32, 172.219],
    scale: [2, 6, 2],
    rotation: [0.701, 0.43, 0.092, 0.561],
    cubeRotation: [0.674, 0.327, 0.213, 0.627],
    own: [0.892, 0.239, 0.37, -0.099],
    forward: [-0.612, 0.5, -0.612],
    up: [-0.707, 0, 0.707],
    right: [0.354, 0.866, 0.354],
    point: [114.267, 21.053, 15.38],
    back: [-29.461, 13.89, -30.708],
    between: [-121, 11.966, 17.477],
    way: [0.86, -0.317, 1.331],
    wayBack: [6.293, 8.485, 2.899],
    seen: [156.607, 166.068, 444.447],
    there: [-37.181, 127.504, 332.093],
    viewport: [0.392, 0.554, 444.447],
    from: [44.668, 21.1, 508.099],
    bounds: [
      [-50, -50, -50],
      [50, 50, 50],
    ],
    parent: [true, true, 1],
  });
});

test("a node turns about its own line, its parent's and the scene's", async ({ page }) => {
  await open(page, "node3d");
  const step = (index) => page.evaluate((index) => window.scene.step(index), index);
  // Its angles are read back from the turn it was given.
  near(await step(0), [
    [0.845, 0.038, 0.462, 0.269],
    [-10.573, 54.492, 29.819],
    [4.296, 4.888, -7.592],
  ]);
  near(await step(1), [
    [0.781, 0.325, 0.342, 0.41],
    [13.088, 55.24, 62.313],
    [4.296, 8.625, -2.674],
  ]);
  near(await step(2), [
    [0.976, -0.058, 0.17, 0.12],
    [0.673, 0.243, 0.404, 0.569],
    [-0.821, -0.133, -0.555],
  ]);
  // One angle assigned leaves the other two as the turn had them.
  near(await step(3), [
    [0.73, 0.375, 0.439, 0.365],
    [3.473, 8.625, -3.68],
    [-40.728, 13.66, 154.541],
  ]);
  near(await step(4), [
    [-4.448, 17.532, 0],
    [-0.3, -0.078, -0.951],
  ]);
});

test("a View3D paints its models as Qt does", async ({ page }) => {
  await open(page, "shaded3d");
  const points = [
    [50, 60],
    [150, 60],
    [250, 60],
    [350, 60],
    [50, 170],
    [150, 170],
    [230, 160],
    [270, 160],
    [230, 180],
    [270, 180],
    [350, 170],
    [335, 160],
    [50, 260],
    [30, 245],
    [150, 260],
    [250, 260],
    [100, 110],
  ];
  // The picture one of them is drawn with arrives when it does.
  await expect.poll(async () => (await pixels(page, [points[6]]))[0]).toBe("255 0 0");
  const painted = (await pixels(page, points)).map((colour) => colour.split(" ").map(Number));
  // What Qt paints there: its own colour, a light full on, a rough and a
  // metal one, one turned from the light, one seen through, the corners of
  // a picture, a ball at its middle and off it, the nearer of two and the
  // further beside it, a back, a back that is drawn, and nothing.
  near(painted, [
    [50, 102, 153],
    [207, 104, 51],
    [77, 214, 117],
    [144, 119, 71],
    [216, 214, 213],
    [144, 16, 16],
    [255, 0, 0],
    [0, 0, 255],
    [255, 0, 0],
    [0, 0, 255],
    [136, 134, 255],
    [123, 121, 239],
    [255, 255, 0],
    [0, 255, 255],
    [32, 32, 32],
    [255, 0, 255],
    [32, 32, 32],
  ], "", 3);
});

test("a model with a skin is bent by its joints as Qt bends it", async ({ page }) => {
  await open(page, "skin3d");
  const R = [255, 0, 0];
  const G = [0, 255, 0];
  const none = [32, 32, 32];
  const points = [
    // The one bent over: up its lower half, round the corner, along its
    // upper half, and where it would be if the model's own place counted.
    [[80, 230], R],
    [[80, 180], R],
    [[100, 150], R],
    [[150, 150], R],
    [[175, 135], R],
    [[175, 165], R],
    [[60, 120], none],
    // The one whose joints undo no pose: its foot, its slanting middle, its
    // upper half moved over, and beside its foot.
    [[200, 230], G],
    [[215, 150], G],
    [[260, 70], G],
    [[240, 230], none],
    // The lit one: its lower half full in the light, darker the more of the
    // turned joint a corner goes with, and its squashed top, and round it.
    [[300, 230], [239, 239, 239]],
    [[320, 230], [239, 239, 239]],
    [[320, 200], [239, 239, 239]],
    [[320, 180], [224, 224, 224]],
    [[320, 160], [202, 202, 202]],
    [[320, 140], [153, 153, 153]],
    [[320, 125], [25, 25, 25]],
    [[320, 110], [0, 0, 0]],
    [[320, 95], none],
    [[305, 110], none],
    [[335, 110], none],
    [[345, 230], none],
  ];
  const at = points.map(([point]) => point);
  await expect.poll(async () => (await pixels(page, [at[0]]))[0]).toBe("255 0 0");
  const painted = (await pixels(page, at)).map((colour) => colour.split(" ").map(Number));
  near(painted, points.map(([, colour]) => colour), "", 3);
  // What it says its bounds are is the mesh's, bent or not.
  near(await page.evaluate(() => window.scene.read()), { bounds: [[-20, 0, 0], [20, 200, 0]] });
});

// What Qt paints through, over the grey the scene is on: Qt's own colour
// and how much of it is there.
const over = ([r, g, b], alpha) => [r, g, b].map((c) => Math.round((c * alpha + 32 * (255 - alpha)) / 255));
const grey = (v) => [v, v, v];

// What is painted at each of the points, once the pictures it is painted
// with are here.
async function painted(page, points, within = 3) {
  const at = points.map(([point]) => point);
  const read = async () => (await pixels(page, at)).map((colour) => colour.split(" ").map(Number));
  const there = (colours) => colours.every((colour, index) => colour.every((channel, part) => Math.abs(channel - points[index][1][part]) < within));
  await expect.poll(async () => there(await read())).toBe(true).catch(() => {});
  return read();
}

test("a material reads its pictures as Qt reads them", async ({ page }) => {
  await open(page, "maps3d");
  const points = [
    // Plain, turned by a picture of the way it faces, turned less, and as
    // rough as one channel of a picture says and as another.
    [[40, 50], grey(188)],
    [[120, 50], grey(168)],
    [[200, 50], grey(184)],
    [[280, 50], grey(189)],
    [[360, 50], grey(188)],
    // All metal, as much metal as a picture's blue says and as its green,
    // and reached by as little light as a picture says, and half of that.
    [[40, 150], [162, 79, 37]],
    [[120, 150], [180, 90, 46]],
    [[200, 150], [183, 93, 51]],
    [[280, 150], grey(90)],
    [[360, 150], grey(124)],
    // Giving off a picture, there as much as a picture's red says, as much
    // as it does not, as much as a picture is there, and rough by one that
    // is half there.
    [[25, 240], [255, 4, 4]],
    [[55, 240], [4, 4, 255]],
    [[25, 260], [255, 4, 4]],
    [[55, 260], [4, 4, 255]],
    [[120, 250], over(grey(185), 51)],
    [[200, 250], over(grey(188), 204)],
    [[280, 250], over(grey(187), 128)],
    [[360, 250], grey(189)],
    [[5, 5], grey(32)],
  ];
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
});

test("a material is turned and seen through as Qt has it", async ({ page }) => {
  await open(page, "turned3d");
  const points = [
    // A metal as rough as a picture says, here and further along, which
    // the eye sees from another side; a picture that is half there says
    // the same.
    [[40, 50], [129, 62, 27]],
    [[120, 50], [139, 67, 30]],
    [[100, 30], [134, 65, 29]],
    [[140, 70], [143, 69, 31]],
    // A DefaultMaterial is turned by a picture as far as `bumpAmount`
    // says, which is not at all until it is set; a picture of heights that
    // rise evenly tilts it a little.
    [[200, 50], grey(187)],
    [[280, 50], grey(186)],
    // Nothing is seen through an opaque one's colour, and it is half there
    // all the same.
    [[360, 50], over(grey(187), 128)],
    // A DefaultMaterial giving off a picture, and there as much as a
    // picture is.
    [[25, 140], [255, 0, 0]],
    [[55, 140], [0, 0, 255]],
    [[120, 150], over(grey(187), 128)],
    // A ball under a clear coat has less of its colour all round than it
    // would have. (The spot of light at its middle is a few pixels wide.)
    [[190, 140], [130, 0, 0]],
    [[210, 160], [119, 0, 0]],
    // A ball turned by a picture, and a tile seen from its back.
    [[280, 150], grey(168)],
    [[270, 140], grey(180)],
    [[295, 160], grey(160)],
    [[360, 150], grey(170)],
    // Giving off a picture besides being lit, masked and half there, a
    // picture laid the other way round, a tile turned on its face, and the
    // ball with no coat.
    [[25, 240], [255, 188, 188]],
    [[55, 240], [188, 188, 255]],
    [[120, 250], over(grey(187), 128)],
    [[200, 250], grey(169)],
    [[280, 250], grey(168)],
    [[360, 250], [188, 15, 15]],
    [[350, 240], [178, 3, 3]],
    [[370, 260], [176, 0, 0]],
  ];
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
});

test("a clear coat and a light's shine are as Qt has them", async ({ page }) => {
  await open(page, "coated3d");
  // Of each ball: its middle, and three places off it. A ball here is of
  // other triangles than Qt's, which shows most where it is darkest, so
  // these are within four of Qt's and not three.
  const points = [
    // A whole coat.
    [[40, 50], [161, 28, 28]],
    [[30, 40], [63, 0, 0]],
    [[52, 58], [166, 6, 6]],
    [[22, 62], [28, 0, 0]],
    // Half of one.
    [[120, 50], [183, 37, 37]],
    [[110, 40], [141, 1, 1]],
    [[132, 58], [164, 4, 4]],
    [[102, 62], [121, 0, 0]],
    // As much of one as a picture's red says.
    [[200, 50], [186, 17, 17]],
    [[190, 40], [166, 4, 4]],
    [[212, 58], [168, 4, 4]],
    [[182, 62], [147, 3, 3]],
    // One as rough as a picture's green says.
    [[280, 50], [174, 41, 41]],
    [[270, 40], [116, 0, 0]],
    [[292, 58], [104, 0, 0]],
    [[262, 62], [99, 0, 0]],
    // And both by its blue.
    [[360, 50], [164, 25, 25]],
    [[350, 40], [136, 4, 4]],
    [[372, 58], [106, 0, 0]],
    [[342, 62], [128, 1, 1]],
    // A coat that gives back more sooner as it turns.
    [[40, 150], [179, 35, 35]],
    [[30, 140], [131, 1, 1]],
    [[52, 158], [163, 4, 4]],
    [[22, 162], [73, 0, 0]],
    // One over what bends light more.
    [[120, 150], [210, 130, 130]],
    [[110, 140], [105, 6, 6]],
    [[132, 158], [133, 10, 10]],
    [[102, 162], [33, 0, 0]],
    // One over a ball a picture turns.
    [[200, 150], [195, 115, 115]],
    [[190, 140], [131, 1, 1]],
    [[212, 158], [92, 0, 0]],
    [[182, 162], [66, 0, 0]],
    // One a picture turns.
    [[280, 150], [69, 0, 0]],
    [[270, 140], [119, 0, 0]],
    [[292, 158], [0, 0, 0]],
    [[262, 162], [132, 5, 5]],
    // And one whose giving back is scaled and shifted.
    [[360, 150], [157, 24, 24]],
    [[350, 140], [147, 4, 4]],
    [[372, 158], [110, 0, 0]],
    [[342, 162], [113, 0, 0]],
    // No coat: what a ball gives back of a light, scaled and shifted, which the lights do not heed.
    [[40, 250], [189, 21, 21]],
    [[30, 240], [178, 0, 0]],
    [[52, 258], [175, 0, 0]],
    [[22, 262], [159, 0, 0]],
    // A fifth as much, which they do not heed either.
    [[120, 250], [190, 37, 37]],
    [[110, 240], [178, 0, 0]],
    [[132, 258], [175, 0, 0]],
    [[102, 262], [159, 0, 0]],
    // In its own colour.
    [[200, 250], [191, 0, 0]],
    [[190, 240], [178, 0, 0]],
    [[212, 258], [175, 0, 0]],
    [[182, 262], [158, 0, 0]],
    // Growing otherwise as it turns.
    [[280, 250], [189, 30, 30]],
    [[270, 240], [178, 0, 0]],
    [[292, 258], [175, 0, 0]],
    [[262, 262], [158, 0, 0]],
    // And none at all.
    [[360, 250], [187, 0, 0]],
    [[350, 240], [178, 0, 0]],
    [[372, 258], [175, 0, 0]],
    [[342, 262], [158, 0, 0]],
  ];
  near(await painted(page, points, 4), points.map(([, colour]) => colour), "", 4);
});

test("a Repeater3D makes a node for every row, inside itself", async ({ page }) => {
  await open(page, "repeater3d");
  // What it makes is its own, and not its parent's as an item a Repeater
  // makes is: where it is moves them, and its parent has it alone.
  near(await page.evaluate(() => window.scene.read()), {
    count: [3, 2, 2],
    objectAt: [-40, null, null],
    parent: [false, true, false, true],
    holder: "before,rep,after",
    scenePosition: [[-40, -160, 0], [20, 80, 0]],
    log: ["added 0 -100", "added 1 -40", "added 2 20"],
  });
  const none = [32, 32, 32];
  const points = [
    // One before them, one for each of three, none for a fourth, and one
    // after them.
    [[30, 70], [255, 255, 255]],
    [[100, 70], [255, 0, 0]],
    [[160, 70], [0, 255, 0]],
    [[220, 70], [0, 0, 255]],
    [[280, 70], none],
    [[370, 70], [128, 128, 128]],
    // Those of a list are moved off the picture with the repeater, and
    // those of an array are where they say.
    [[100, 230], none],
    [[160, 230], none],
    [[260, 230], [255, 128, 0]],
    [[320, 230], [128, 0, 255]],
    [[200, 150], none],
  ];
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
  // Another number of them is all of them anew: the last goes first.
  expect(await page.evaluate(() => window.scene.grow(4))).toEqual({
    count: 4,
    log: ["removed 2 20", "removed 1 -40", "removed 0 -100", "added 0 -100", "added 1 -40", "added 2 20", "added 3 80"],
    holder: "before,rep,after",
  });
  expect(await page.evaluate(() => window.scene.grow(2))).toEqual({
    count: 2,
    log: ["removed 3 80", "removed 2 20", "removed 1 -40", "removed 0 -100", "added 0 -100", "added 1 -40"],
    holder: "before,rep,after",
  });
  // A list that says what changed in it is followed row by row.
  expect(await page.evaluate(() => window.scene.swap())).toEqual({ count: 2, x: -100 });
});

test("a picture of everything round a scene is seen behind it", async ({ page }) => {
  await open(page, "sky3d");
  // Looking each of four ways: the corners of the view, and between them
  // and its middle, above the horizon, on it and below. The picture shows
  // less bright than it is: white is 208.
  const ways = {
    0: [
      [[50, 40], [208, 0, 0]],
      [[350, 40], [0, 208, 0]],
      [[100, 75], [208, 0, 0]],
      [[300, 75], [0, 208, 0]],
      [[50, 150], [169, 65, 65]],
      [[350, 150], [125, 208, 125]],
      [[100, 225], [122, 122, 122]],
      [[300, 225], [208, 208, 208]],
      [[50, 260], [122, 122, 122]],
      [[350, 260], [208, 208, 208]],
    ],
    90: [
      [[50, 40], [208, 208, 0]],
      [[350, 40], [208, 0, 0]],
      [[100, 75], [208, 208, 0]],
      [[300, 75], [208, 0, 0]],
      [[50, 150], [208, 118, 125]],
      [[350, 150], [169, 65, 65]],
      [[100, 225], [208, 0, 208]],
      [[300, 225], [122, 122, 122]],
      [[50, 260], [208, 0, 208]],
      [[350, 260], [122, 122, 122]],
    ],
    180: [
      [[50, 40], [0, 0, 208]],
      [[350, 40], [208, 208, 0]],
      [[100, 75], [0, 0, 208]],
      [[300, 75], [208, 208, 0]],
      [[50, 150], [0, 125, 208]],
      [[350, 150], [208, 118, 125]],
      [[100, 225], [0, 208, 208]],
      [[300, 225], [208, 0, 208]],
      [[50, 260], [0, 208, 208]],
      [[350, 260], [208, 0, 208]],
    ],
    270: [
      [[50, 40], [0, 208, 0]],
      [[350, 40], [0, 0, 208]],
      [[100, 75], [0, 208, 0]],
      [[300, 75], [0, 0, 208]],
      [[50, 150], [125, 208, 125]],
      [[350, 150], [0, 125, 208]],
      [[100, 225], [208, 208, 208]],
      [[300, 225], [0, 208, 208]],
      [[50, 260], [208, 208, 208]],
      [[350, 260], [0, 208, 208]],
    ],
  };
  for (const [turn, points] of Object.entries(ways)) {
    await page.evaluate((turn) => void (window.scene.turn = turn), Number(turn));
    near(await painted(page, points), points.map(([, colour]) => colour), `turned ${turn}`, 3);
  }
  // Blurred by half and wholly, looking the first way: each is the picture
  // as a surface that rough would give it back.
  await page.evaluate(() => void (window.scene.turn = 0));
  const blurs = {
    0.5: [
      [[50, 40], [195, 102, 64]],
      [[350, 40], [123, 201, 107]],
      [[100, 75], [189, 120, 80]],
      [[300, 75], [139, 197, 116]],
      [[200, 75], [167, 169, 97]],
      [[50, 150], [178, 114, 102]],
      [[350, 150], [165, 202, 162]],
      [[200, 150], [171, 173, 137]],
      [[100, 225], [161, 139, 132]],
      [[300, 225], [187, 199, 184]],
      [[200, 225], [175, 176, 164]],
      [[50, 260], [155, 131, 129]],
      [[350, 260], [192, 202, 192]],
    ],
    1: [
      [[50, 40], [180, 153, 104]],
      [[350, 40], [159, 185, 146]],
      [[100, 75], [177, 157, 113]],
      [[300, 75], [164, 183, 142]],
      [[200, 75], [171, 172, 125]],
      [[50, 150], [179, 149, 126]],
      [[350, 150], [165, 190, 159]],
      [[200, 150], [173, 173, 140]],
      [[100, 225], [177, 157, 145]],
      [[300, 225], [170, 188, 164]],
      [[200, 225], [174, 175, 154]],
      [[50, 260], [178, 151, 148]],
      [[350, 260], [169, 191, 172]],
    ],
  };
  for (const [blur, points] of Object.entries(blurs)) {
    await page.evaluate((blur) => void (window.scene.blur = blur), Number(blur));
    near(await painted(page, points), points.map(([, colour]) => colour), `blurred ${blur}`, 3);
  }
});

test("a scene is lit by a picture of everything round it", async ({ page }) => {
  await open(page, "probe3d");
  // Of each ball: its middle and four places off it. The cube the picture
  // is folded into is blurred by the same sums as Qt's, and read by another
  // GPU, so these are within three of Qt's and not two.
  const points = [
    // Rough.
    [[40, 80], [136, 172, 199]],
    [[28, 68], [151, 165, 191]],
    [[52, 68], [112, 172, 192]],
    [[28, 92], [162, 169, 199]],
    [[52, 92], [142, 184, 202]],
    // A DefaultMaterial.
    [[40, 220], [131, 168, 194]],
    [[28, 208], [158, 166, 177]],
    [[52, 208], [115, 171, 185]],
    [[28, 232], [153, 168, 196]],
    [[52, 232], [127, 180, 201]],
    // Half as rough.
    [[120, 80], [150, 170, 200]],
    [[108, 68], [171, 167, 187]],
    [[132, 68], [122, 170, 196]],
    [[108, 92], [174, 163, 198]],
    [[132, 92], [147, 183, 205]],
    // A DefaultMaterial with a shine.
    [[120, 220], [151, 174, 250]],
    [[108, 208], [238, 233, 172]],
    [[132, 208], [125, 185, 239]],
    [[108, 232], [235, 168, 251]],
    [[132, 232], [136, 239, 255]],
    // A mirror.
    [[200, 80], [38, 186, 208]],
    [[188, 68], [208, 208, 0]],
    [[212, 68], [0, 0, 208]],
    [[188, 92], [208, 0, 208]],
    [[212, 92], [0, 208, 208]],
    // Red under a clear coat.
    [[200, 220], [164, 38, 51]],
    [[188, 208], [132, 58, 5]],
    [[212, 208], [86, 16, 58]],
    [[188, 232], [129, 9, 60]],
    [[212, 232], [87, 60, 61]],
    // A metal, a little rough.
    [[280, 80], [177, 129, 183]],
    [[268, 68], [192, 179, 74]],
    [[292, 68], [83, 109, 186]],
    [[268, 92], [172, 89, 172]],
    [[292, 92], [107, 188, 193]],
    // Giving nothing back.
    [[280, 220], [181, 166, 178]],
    [[268, 208], [192, 165, 152]],
    [[292, 208], [159, 165, 177]],
    [[268, 232], [190, 159, 178]],
    [[292, 232], [163, 166, 193]],
    // Rough and red.
    [[360, 80], [186, 19, 26]],
    [[348, 68], [195, 19, 11]],
    [[372, 68], [176, 21, 25]],
    [[348, 92], [186, 15, 24]],
    [[372, 92], [170, 25, 32]],
    // Half metal, tinted.
    [[360, 220], [186, 140, 0]],
    [[348, 208], [188, 131, 0]],
    [[372, 208], [94, 82, 28]],
    [[348, 232], [185, 75, 28]],
    [[372, 232], [109, 138, 28]],
  ];
  near(await painted(page, points, 4), points.map(([, colour]) => colour), "", 4);

  // The middles of the balls and the four places on the mirror, with the
  // picture twice as bright, reaching half as far below the horizon, turned
  // a quarter about the way up, and tilted.
  const at = [
    [40, 80],
    [120, 80],
    [200, 80],
    [188, 68],
    [212, 68],
    [188, 92],
    [212, 92],
    [280, 80],
    [360, 80],
    [40, 220],
    [120, 220],
    [200, 220],
    [280, 220],
    [360, 220],
  ];
  const set = async (change, colours) => {
    await page.evaluate(change);
    const expected = at.map((point, index) => [point, colours[index]]).filter(([, colour]) => colour);
    near(await painted(page, expected, 4), expected.map(([, colour]) => colour), String(change), 4);
  };
  await set(() => void (window.scene.exposure = 2), [
    [176, 211, 234],
    [190, 211, 236],
    [55, 224, 239],
    [239, 239, 0],
    [0, 0, 239],
    [239, 0, 239],
    [0, 239, 239],
    [216, 168, 221],
    [223, 31, 39],
    [170, 208, 229],
    [193, 217, 255],
    [205, 56, 72],
    [219, 205, 216],
    [229, 179, 4],
  ]);
  await set(() => void ((window.scene.exposure = 1), (window.scene.horizon = 0.5)), [
    [102, 133, 159],
    [113, 131, 159],
    [25, 146, 168],
    [207, 207, 0],
    [0, 0, 207],
    [168, 0, 168],
    [0, 168, 168],
    [137, 96, 143],
    [146, 11, 15],
    [108, 142, 166],
    [129, 149, 220],
    [143, 30, 41],
    [158, 143, 155],
    [156, 115, 0],
  ]);
  await set(() => void ((window.scene.horizon = 0), window.scene.turn(0, 90, 0)), [
    [156, 196, 181],
    [152, 198, 190],
    [186, 208, 208],
    [0, 0, 208],
    [0, 208, 0],
    [0, 208, 208],
    [208, 208, 208],
    [99, 183, 190],
    [125, 26, 31],
    [146, 192, 170],
    [138, 232, 182],
    [116, 51, 42],
    [109, 180, 190],
    [57, 91, 26],
  ]);
  await set(() => window.scene.turn(40, 0, 0), [
    [153, 182, 202],
    [160, 179, 204],
    [0, 208, 208],
    [208, 0, 208],
    // An edge in the picture runs through here.
    null,
    [122, 122, 122],
    [208, 208, 208],
    [176, 117, 190],
    [181, 18, 27],
    [142, 176, 202],
    [157, 236, 255],
    [165, 48, 64],
    [179, 162, 192],
    [185, 78, 26],
  ]);
});

test("the sky QtQuick3D.Helpers makes is the one Qt makes", async ({ page }) => {
  await open(page, "procedural3d");
  // Looking away, to the left, behind, at the sun, down and up: the view
  // all over, and down its middle, where the sky meets the ground.
  const ways = [
    [
      [0, 0],
      [
        [[50, 40], [154, 186, 201]],
        [[200, 40], [153, 186, 201]],
        [[350, 40], [154, 186, 201]],
        [[50, 150], [131, 136, 140]],
        [[200, 150], [127, 131, 134]],
        [[350, 150], [132, 136, 140]],
        [[50, 260], [40, 47, 53]],
        [[200, 260], [40, 47, 53]],
        [[350, 260], [40, 47, 53]],
        [[200, 100], [162, 189, 202]],
        [[200, 120], [169, 191, 203]],
        [[200, 135], [176, 193, 204]],
        [[200, 145], [182, 196, 205]],
        [[200, 155], [81, 78, 77]],
        [[200, 165], [56, 58, 61]],
        [[200, 200], [40, 47, 54]],
      ],
    ],
    [
      [0, 90],
      [
        [[50, 40], [154, 186, 201]],
        [[200, 40], [161, 189, 202]],
        [[350, 40], [154, 186, 201]],
        [[50, 150], [131, 136, 140]],
        [[200, 150], [127, 131, 134]],
        [[350, 150], [132, 136, 140]],
        [[50, 260], [40, 47, 53]],
        [[200, 260], [40, 47, 53]],
        [[350, 260], [40, 47, 53]],
        [[200, 100], [162, 189, 202]],
        [[200, 120], [169, 191, 203]],
        [[200, 135], [176, 193, 204]],
        [[200, 145], [182, 196, 205]],
        [[200, 155], [81, 78, 77]],
        [[200, 165], [56, 58, 61]],
        [[200, 200], [40, 47, 54]],
      ],
    ],
    [
      [0, 180],
      [
        [[50, 40], [154, 186, 201]],
        [[200, 40], [153, 186, 201]],
        [[350, 40], [154, 186, 201]],
        [[50, 150], [131, 136, 140]],
        [[200, 150], [127, 131, 134]],
        [[350, 150], [132, 136, 140]],
        [[50, 260], [40, 47, 53]],
        [[200, 260], [40, 47, 53]],
        [[350, 260], [40, 47, 53]],
        [[200, 100], [162, 189, 202]],
        [[200, 120], [169, 191, 203]],
        [[200, 135], [176, 193, 204]],
        [[200, 145], [182, 196, 205]],
        [[200, 155], [81, 78, 77]],
        [[200, 165], [56, 58, 61]],
        [[200, 200], [40, 47, 54]],
      ],
    ],
    [
      [35, 90],
      [
        [[50, 40], [152, 186, 201]],
        [[200, 40], [152, 186, 201]],
        [[350, 40], [152, 186, 201]],
        [[50, 150], [152, 186, 201]],
        [[200, 150], [208, 208, 208]],
        [[350, 150], [152, 186, 201]],
        [[50, 260], [162, 189, 202]],
        [[200, 260], [161, 188, 202]],
        [[350, 260], [162, 189, 202]],
        [[200, 100], [162, 189, 202]],
        [[200, 120], [176, 194, 203]],
        [[200, 135], [193, 201, 205]],
        [[200, 145], [207, 208, 208]],
        [[200, 155], [207, 207, 208]],
        [[200, 165], [193, 201, 205]],
        [[200, 200], [163, 189, 202]],
      ],
    ],
    [
      [-60, 0],
      [
        [[50, 40], [40, 47, 53]],
        [[200, 40], [40, 47, 53]],
        [[350, 40], [40, 47, 53]],
        [[50, 150], [40, 47, 53]],
        [[200, 150], [40, 47, 53]],
        [[350, 150], [40, 47, 53]],
        [[50, 260], [40, 47, 53]],
        [[200, 260], [40, 47, 53]],
        [[350, 260], [40, 47, 53]],
        [[200, 100], [40, 47, 53]],
        [[200, 120], [40, 47, 53]],
        [[200, 135], [40, 47, 53]],
        [[200, 145], [40, 47, 53]],
        [[200, 155], [40, 47, 53]],
        [[200, 165], [40, 47, 53]],
        [[200, 200], [40, 47, 53]],
      ],
    ],
    [
      [60, 0],
      [
        [[50, 40], [152, 186, 201]],
        [[200, 40], [152, 186, 201]],
        [[350, 40], [152, 186, 201]],
        [[50, 150], [152, 186, 201]],
        [[200, 150], [152, 186, 201]],
        [[350, 150], [152, 186, 201]],
        [[50, 260], [152, 186, 201]],
        [[200, 260], [152, 186, 201]],
        [[350, 260], [152, 186, 201]],
        [[200, 100], [152, 186, 201]],
        [[200, 120], [152, 186, 201]],
        [[200, 135], [152, 186, 201]],
        [[200, 145], [152, 186, 201]],
        [[200, 155], [152, 186, 201]],
        [[200, 165], [152, 186, 201]],
        [[200, 200], [152, 186, 201]],
      ],
    ],
  ];
  for (const [[x, y], points] of ways) {
    await page.evaluate(([x, y]) => window.scene.turn(x, y, 0), [x, y]);
    near(await painted(page, points), points.map(([, colour]) => colour), `turned ${x}, ${y}`, 3);
  }
});

test("a picture given as its numbers is drawn as Qt draws it", async ({ page }) => {
  await open(page, "data3d");
  // The four pixels of each sheet.
  const points = [
    // Four colours a byte each: the first row is the bottom one.
    [[30, 80], [0, 0, 255]],
    [[70, 80], [255, 255, 0]],
    [[30, 120], [255, 0, 0]],
    [[70, 120], [0, 255, 0]],
    // The same as fractions, which a DefaultMaterial reads as a screen shows them.
    [[130, 80], [255, 128, 7]],
    [[170, 80], [50, 50, 50]],
    [[130, 120], [128, 64, 255]],
    [[170, 120], [22, 0, 204]],
    // Seen through, and saying so.
    [[230, 80], [0, 0, 255]],
    [[270, 80], over([255, 255, 0], 64)],
    [[230, 120], over([255, 0, 0], 128)],
    [[270, 120], over([0, 255, 0], 128)],
    // Seen through all the same where it does not.
    [[330, 80], [0, 0, 255]],
    [[370, 80], over([255, 255, 0], 64)],
    [[330, 120], over([255, 0, 0], 128)],
    [[370, 120], over([0, 255, 0], 128)],
    // One channel, which is red.
    [[30, 180], [64, 0, 0]],
    [[70, 180], [0, 0, 0]],
    [[30, 220], [255, 0, 0]],
    [[70, 220], [128, 0, 0]],
    // The numbers, and not the file named beside them.
    [[130, 180], [0, 128, 255]],
    [[170, 180], [0, 128, 255]],
    [[130, 220], [0, 128, 255]],
    [[170, 220], [0, 128, 255]],
    // Fractions as a PrincipledMaterial's colour, which are in linear light.
    [[230, 180], [255, 187, 63]],
    [[270, 180], [123, 123, 123]],
    [[230, 220], [187, 137, 255]],
    [[270, 220], [89, 39, 231]],
    // And as halves.
    [[330, 180], [255, 128, 7]],
    [[370, 180], [50, 50, 50]],
    [[330, 220], [128, 64, 255]],
    [[370, 220], [22, 0, 204]],
  ];
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
});

test("a DefaultMaterial gives back a light as Qt has it", async ({ page }) => {
  await open(page, "shine3d");
  // Of each ball: its middle and three places off it. What it gives back is
  // in its own colour.
  const points = [
    // A little rough: a wide spot, dimmed by as much as it is rough.
    [[80, 150], [152, 77, 37]],
    [[90, 140], [117, 58, 26]],
    [[100, 150], [92, 44, 19]],
    [[70, 165], [133, 67, 31]],
    // Smooth: a spot too small to see.
    [[160, 150], [145, 73, 35]],
    [[170, 140], [119, 59, 27]],
    [[180, 150], [106, 52, 23]],
    [[150, 165], [120, 59, 27]],
    // Tinted green, which a light's shine is not.
    [[240, 150], [146, 74, 35]],
    [[250, 140], [135, 67, 32]],
    [[260, 150], [124, 62, 29]],
    [[230, 165], [117, 58, 26]],
    // None.
    [[320, 150], [123, 61, 28]],
    [[330, 140], [125, 62, 29]],
    [[340, 150], [127, 63, 30]],
    [[310, 165], [104, 51, 22]],
    // Behind them, the colour the scene is cleared with, which Qt takes to linear
    // light and back: 30 for 32.
    [[200, 150], [30, 30, 30]],
    [[20, 20], [30, 30, 30]],
  ];
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
});

test("a Radiance picture lights a scene and is drawn as Qt has it", async ({ page }) => {
  await open(page, "hdr3d");
  const points = [
    // Behind: red and green above, each four times as bright as white and
    // showing little brighter, and grey and white below.
    [[50, 40], [253, 129, 129]],
    [[350, 40], [129, 253, 129]],
    [[100, 75], [253, 129, 129]],
    [[300, 75], [129, 253, 129]],
    [[50, 260], [129, 129, 129]],
    [[350, 260], [208, 208, 208]],
    [[100, 225], [129, 129, 129]],
    [[300, 225], [208, 208, 208]],
    // A rough ball, lit from all round.
    [[80, 150], [189, 216, 243]],
    [[70, 140], [207, 214, 240]],
    [[90, 160], [177, 219, 241]],
    // A mirror, and the four colours that are behind the eye.
    [[200, 150], [205, 214, 241]],
    [[188, 138], [239, 239, 96]],
    [[212, 138], [129, 129, 253]],
    [[188, 162], [239, 96, 239]],
    [[212, 162], [96, 239, 239]],
    // The picture as a colour: what is brighter than white is white.
    [[290, 140], [255, 137, 137]],
    [[310, 140], [137, 255, 137]],
    [[330, 140], [137, 137, 255]],
    [[350, 140], [255, 255, 99]],
    [[290, 160], [137, 137, 137]],
    [[310, 160], [255, 255, 255]],
    [[330, 160], [99, 255, 255]],
    [[350, 160], [255, 99, 255]],
  ];
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
});

test("surroundings Qt baked into a KTX file light a scene as they are", async ({ page }) => {
  await open(page, "baked3d");
  const points = [
    // Behind, three sides of the cube and the quarters of each: the left
    // one, the one ahead, and the one below.
    [[60, 60], [62, 168, 168]],
    [[300, 60], [129, 129, 43]],
    [[350, 250], [155, 154, 61]],
    [[370, 150], [135, 135, 46]],
    [[100, 250], [168, 62, 168]],
    [[200, 270], [168, 62, 168]],
    [[20, 290], [211, 94, 212]],
    // A rough ball, lit by the last level, where each side is the other
    // colours than its own.
    [[78, 150], [136, 158, 161]],
    [[60, 140], [163, 143, 151]],
    [[95, 165], [91, 171, 165]],
    // A mirror: the three sides behind the eye, of the first level.
    [[200, 150], [87, 87, 208]],
    [[190, 135], [62, 168, 62]],
    [[212, 138], [87, 208, 87]],
    [[200, 128], [118, 239, 118]],
    [[188, 162], [59, 59, 161]],
    [[212, 165], [157, 56, 56]],
    // A ball half as smooth: the same sides, of a level between, which is
    // dimmer.
    [[320, 150], [45, 45, 134]],
    [[310, 140], [45, 130, 77]],
    [[335, 160], [134, 45, 45]],
    [[320, 172], [134, 45, 134]],
  ];
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
});

test("a KTX file is a material's picture by its first side", async ({ page }) => {
  await open(page, "bakedmap3d");
  const points = [
    // In linear light: twice as bright as white, and a fifth of it.
    [[100, 130], [255, 123, 123]],
    [[140, 130], [255, 89, 89]],
    [[100, 170], [187, 63, 63]],
    [[140, 170], [137, 44, 44]],
    // As a screen shows it.
    [[260, 130], [255, 50, 50]],
    [[300, 130], [255, 22, 22]],
    [[260, 170], [128, 7, 7]],
    [[300, 170], [64, 0, 0]],
  ];
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
});

test("a Targa file is a picture, by the rows it says it begins with and by runs", async ({ page }) => {
  await open(page, "tga3d");
  const quarters = (x) => [
    [x - 25, 125],
    [x + 25, 125],
    [x - 25, 175],
    [x + 25, 175],
  ];
  const red = [255, 0, 0];
  const green = [0, 255, 0];
  const blue = [0, 0, 255];
  const grey = [128, 128, 128];
  const dark = [60, 60, 60];
  const at = [...quarters(80), ...quarters(200), ...quarters(320)];
  const wanted = [red, green, blue, grey, red, green, blue, grey, dark, dark, blue, grey];
  near(await painted(page, at.map((point) => [point])), wanted, "", 3);
});

test("a material's gl_FragCoord is where its fragment is, on the view and in depth", async ({ page }) => {
  await open(page, "fragcoord3d");
  const points = [
    [[200, 120], [255, 255, 0]],
    [[200, 180], [0, 255, 0]],
  ];
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
});

test("the shapes QtQuick3D.Helpers works out are the ones Qt works out", async ({ page }) => {
  await open(page, "geometry3d");
  // The box each fits in. A grid's is not the one it fills, and a shape
  // whose numbers make none has none.
  near(await page.evaluate(() => window.scene.read()), {
    plane: [
      [-50, -50, 0],
      [50, 50, 0],
    ],
    turned: [
      [-60, 0, -40],
      [60, 0, 40],
    ],
    cuboid: [
      [-50, -30, -40],
      [50, 30, 40],
    ],
    sphere: [
      [-50, -50, -50],
      [50, 50, 50],
    ],
    torus: [
      [-50, -14.97, -49.901],
      [50, 14.97, 49.901],
    ],
    cylinder: [
      [-30, -40, -30],
      [30, 40, 30],
    ],
    cone: [
      [-50, -50, -50],
      [50, 50, 50],
    ],
    cut: [
      [-50, -30, -50],
      [50, 30, 50],
    ],
    given: [
      [-50, -50, 0],
      [50, 50, 0],
    ],
    grid: [
      [-40, -40, 0],
      [60, 60, 0],
    ],
    nothing: [
      [0, 0, 0],
      [0, 0, 0],
    ],
    status: [1, 0],
  });
  const points = [
    // With a picture and no light: a plane, one that lies flat, is seen
    // from behind and has its picture upside down, a cuboid, a sphere and a
    // torus.
    [[18, 30], [255, 0, 0]],
    [[30, 30], [0, 255, 0]],
    [[42, 30], [0, 0, 255]],
    [[66, 30], [255, 255, 0]],
    [[222, 30], [128, 128, 128]],
    [[282, 30], [0, 0, 255]],
    [[354, 30], [255, 255, 255]],
    [[366, 30], [128, 128, 128]],
    [[18, 42], [255, 0, 0]],
    [[30, 42], [0, 255, 0]],
    [[42, 42], [0, 0, 255]],
    [[66, 42], [255, 255, 0]],
    [[90, 42], [255, 255, 0]],
    [[114, 42], [0, 0, 255]],
    [[126, 42], [0, 255, 0]],
    [[150, 42], [255, 0, 0]],
    [[186, 42], [255, 255, 0]],
    [[270, 42], [0, 0, 255]],
    [[282, 42], [0, 0, 255]],
    [[294, 42], [0, 0, 255]],
    [[342, 42], [255, 255, 255]],
    [[378, 42], [128, 128, 128]],
    [[18, 54], [128, 128, 128]],
    [[30, 54], [255, 255, 255]],
    [[42, 54], [0, 255, 255]],
    [[66, 54], [255, 0, 255]],
    [[90, 54], [255, 0, 255]],
    [[114, 54], [0, 255, 255]],
    [[126, 54], [255, 255, 255]],
    [[150, 54], [128, 128, 128]],
    [[222, 54], [0, 0, 255]],
    [[234, 54], [255, 255, 0]],
    [[282, 54], [0, 0, 255]],
    [[294, 54], [0, 0, 255]],
    [[306, 54], [255, 255, 0]],
    [[342, 54], [0, 255, 255]],
    [[378, 54], [255, 0, 255]],
    [[18, 66], [128, 128, 128]],
    [[30, 66], [255, 255, 255]],
    [[42, 66], [0, 255, 255]],
    [[66, 66], [255, 0, 255]],
    [[90, 66], [255, 0, 255]],
    [[114, 66], [0, 255, 255]],
    [[126, 66], [255, 255, 255]],
    [[150, 66], [128, 128, 128]],
    [[186, 66], [128, 128, 128]],
    [[270, 66], [0, 255, 255]],
    [[282, 66], [0, 255, 255]],
    [[342, 66], [0, 255, 255]],
    [[354, 66], [0, 255, 255]],
    [[366, 66], [255, 0, 255]],
    [[378, 66], [255, 0, 255]],
    // A cylinder, a cone, one with its top cut off, corners given as lists
    // and drawn in two parts, and a grid of lines.
    [[42, 130], [255, 255, 255]],
    [[42, 142], [255, 0, 0]],
    [[114, 142], [128, 128, 128]],
    [[126, 142], [255, 255, 255]],
    [[210, 142], [255, 255, 255]],
    [[30, 154], [0, 255, 0]],
    [[42, 154], [255, 0, 0]],
    [[54, 154], [255, 0, 0]],
    [[102, 154], [0, 255, 255]],
    [[114, 154], [0, 255, 255]],
    [[126, 154], [255, 0, 255]],
    [[186, 154], [0, 255, 0]],
    [[210, 154], [255, 0, 0]],
    [[258, 154], [255, 128, 0]],
    [[270, 154], [255, 128, 0]],
    [[54, 166], [255, 0, 0]],
    [[102, 166], [0, 255, 255]],
    [[114, 166], [0, 255, 255]],
    [[126, 166], [255, 0, 255]],
    [[138, 166], [255, 0, 255]],
    [[174, 166], [0, 255, 0]],
    [[186, 166], [0, 255, 0]],
    [[210, 166], [255, 0, 0]],
    [[222, 166], [255, 0, 0]],
    [[258, 166], [255, 128, 0]],
    [[270, 166], [255, 128, 0]],
    [[282, 166], [255, 128, 0]],
    [[102, 178], [0, 255, 255]],
    [[114, 178], [0, 255, 255]],
    [[126, 178], [255, 0, 255]],
    [[138, 178], [255, 0, 255]],
    [[186, 178], [0, 255, 0]],
    [[210, 178], [255, 0, 0]],
    // Grey under a light: which way each part of a shape faces.
    [[30, 232], [158, 158, 158]],
    [[42, 232], [158, 158, 158]],
    [[54, 232], [158, 158, 158]],
    [[114, 232], [189, 189, 189]],
    [[186, 232], [188, 188, 188]],
    [[198, 232], [188, 188, 188]],
    [[282, 232], [182, 182, 182]],
    [[6, 244], [168, 168, 168]],
    [[18, 244], [168, 168, 168]],
    [[102, 244], [186, 186, 186]],
    [[282, 244], [182, 182, 182]],
    [[6, 256], [168, 168, 168]],
    [[18, 256], [168, 168, 168]],
    [[30, 256], [73, 73, 73]],
    [[42, 256], [73, 73, 73]],
    [[54, 256], [73, 73, 73]],
    [[66, 256], [73, 73, 73]],
    [[258, 256], [169, 169, 169]],
    [[306, 256], [0, 0, 0]],
    [[18, 268], [168, 168, 168]],
    [[30, 268], [73, 73, 73]],
    [[42, 268], [73, 73, 73]],
    [[54, 268], [73, 73, 73]],
    [[66, 268], [73, 73, 73]],
    [[138, 268], [0, 0, 0]],
    [[198, 268], [106, 106, 106]],
    [[258, 268], [165, 165, 165]],
    [[270, 280], [148, 148, 148]],
  ];
  near(await painted(page, points, 4), points.map(([, colour]) => colour), "", 4);
});

test("a shape handed over as its numbers is drawn, part by part", async ({ page }) => {
  await open(page, "geometrygiven3d");
  const read = () => page.evaluate(() => window.scene.read());
  expect(await read()).toEqual({
    // The box a Model fits in is the one that fits its parts.
    bounds: [
      [-80, -80, 0],
      [80, 80, 0],
    ],
    stride: 24,
    attributes: 3,
    second: [2, 12, 3],
    primitive: 5,
    vertices: 144,
    indices: 12,
    subsets: 2,
    name: "upper",
    min: -80,
    // Told once of all that was handed over.
    dirtied: 1,
  });
  // One triangle to the lower right and one to the upper left, each in the
  // colour of the material its part has.
  const points = [
    [[160, 160], [255, 0, 0]],
    [[120, 170], [255, 0, 0]],
    [[40, 60], [0, 0, 255]],
    [[30, 80], [0, 0, 255]],
    [[40, 170], [32, 32, 32]],
    [[160, 40], [32, 32, 32]],
    [[100, 100], [32, 32, 32]],
  ];
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
  // A corner moved where it was: what is drawn follows.
  await page.evaluate(() => window.scene.move());
  const moved = [
    [[40, 170], [255, 0, 0]],
    [[160, 160], [255, 0, 0]],
  ];
  near(await painted(page, moved), moved.map(([, colour]) => colour), "", 3);
  await page.evaluate(() => window.scene.empty());
  const gone = [
    [[160, 160], [32, 32, 32]],
    [[40, 60], [32, 32, 32]],
  ];
  near(await painted(page, gone), gone.map(([, colour]) => colour), "", 3);
  expect((await read()).vertices).toBe(0);
});

test("a node told to face another keeps facing it, as Qt turns it", async ({ page }) => {
  await open(page, "lookat3d");
  const read = () => page.evaluate(() => window.scene.read());
  // It is turned by where the two are in the scene, which is not towards
  // the other where what it is in is turned itself. How far it is rolled
  // stays; a camera is not rolled at all.
  near(await read(), {
    plain: [14.3633, -39.8056, 25],
    forward: [0.62017, 0.24807, -0.74421],
    inner: [27.7069, 19.5631, 0],
    innerForward: [-0.73359, 0.66722, -0.12906],
    camera: [-12.937, 5.4923, 0],
    cameraForward: [-0.09328, -0.22388, -0.97014],
    none: [10, 20, 30],
  });
  await page.evaluate(() => window.scene.go());
  near(await read(), {
    plain: [-21.9792, 42.2737, 25],
    forward: [-0.62378, -0.37427, -0.68616],
    inner: [-15.352, 88.2731, 0],
    innerForward: [-0.71369, -0.39235, 0.58027],
    camera: [-23.9297, 33.6901, 0],
    cameraForward: [-0.50702, -0.40562, -0.76053],
  });
  await page.evaluate(() => window.scene.away());
  near(await read(), {
    plain: [-66.3833, 42.2737, 25],
    forward: [-0.26948, -0.91625, -0.29643],
    inner: [-15.352, 88.2731, 0],
    camera: [-27.503, 12.5288, 0],
    cameraForward: [-0.19241, -0.46179, -0.86587],
  });
  // What the camera looks at is in the middle of what it sees.
  const points = [[[100, 100], [192, 64, 64]]];
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
});

// The clear colour twice, the sphere, two sides of the cube, the blue
// rectangle alone and under the white one that is seen through, and that
// one over the rectangle that Qt draws black.
const EXTENDED = [[20, 20], [70, 110], [150, 100], [140, 80], [262, 40], [230, 40], [230, 120], [10, 100]];

// The scene is opened anew for each thing asked of it, and is Qt's colours
// at those places.
async function extended(page, states) {
  for (const [call, colours] of states) {
    await open(page, "extended3d");
    if (call) await page.evaluate(`window.scene.${call}`);
    near(await painted(page, EXTENDED.map((point, index) => [point, colours[index]])), colours, call, 3);
  }
}

test("an ExtendedSceneEnvironment brings a scene to the screen as Qt's does", async ({ page }) => {
  await extended(page, [
    // Things are laid over one another in linear light: the white one shows
    // 170 over black, where a SceneEnvironment (the last row) shows 102.
    ["", [[64, 80, 96], [183, 122, 61], [30, 101, 48], [73, 216, 109], [128, 144, 255], [192, 198, 255], [170, 170, 170], [64, 80, 96]]],
    // The exposure is taken before the tone mapping, of the clear colour too.
    ["brighter()", [[100, 124, 148], [255, 186, 96], [50, 155, 77], [113, 255, 166], [194, 218, 255], [255, 255, 255], [255, 255, 255], [100, 124, 148]]],
    ["adjusted()", [[38, 45, 52], [114, 89, 63], [11, 41, 19], [75, 134, 90], [125, 131, 177], [176, 179, 202], [138, 138, 138], [38, 45, 52]]],
    // The colour of a vignette is one of linear light.
    ["vignetted()", [[16, 19, 29], [123, 82, 47], [24, 80, 43], [57, 167, 90], [55, 61, 114], [104, 106, 144], [111, 111, 117], [19, 23, 34]]],
    ["plain()", [[64, 80, 96], [183, 122, 61], [29, 101, 48], [73, 215, 109], [128, 144, 255], [179, 188, 255], [102, 102, 102], [64, 80, 96]]],
  ]);
});

test("an ExtendedSceneEnvironment maps the tones of a scene as Qt's does", async ({ page }) => {
  await extended(page, [
    // With no tone mapping the numbers of linear light are shown as they are.
    ["toned(0, 1)", [[13, 21, 30], [121, 50, 12], [3, 34, 8], [17, 174, 39], [55, 71, 255], [135, 145, 255], [102, 102, 102], [13, 21, 30]]],
    ["toned(2, 1)", [[61, 86, 113], [219, 153, 56], [17, 121, 38], [74, 239, 133], [161, 181, 255], [226, 229, 255], [208, 208, 208], [61, 86, 113]]],
    ["toned(2, 2)", [[56, 80, 105], [205, 143, 52], [15, 113, 35], [69, 223, 124], [150, 169, 238], [211, 214, 238], [194, 194, 194], [56, 80, 105]]],
    ["toned(3, 1)", [[88, 108, 127], [210, 155, 84], [44, 132, 68], [99, 233, 141], [161, 176, 255], [217, 221, 255], [199, 199, 199], [88, 108, 127]]],
    ["toned(3, 2)", [[76, 94, 111], [185, 136, 73], [37, 116, 58], [86, 205, 123], [141, 155, 224], [191, 194, 224], [175, 175, 175], [76, 94, 111]]],
    ["toned(4, 1)", [[79, 102, 123], [214, 156, 76], [35, 130, 58], [92, 235, 140], [162, 179, 255], [220, 224, 255], [203, 203, 203], [79, 102, 123]]],
    ["toned(4, 2)", [[71, 91, 111], [193, 140, 67], [30, 117, 51], [82, 212, 126], [146, 162, 230], [199, 203, 230], [183, 183, 183], [71, 91, 111]]],
  ]);
});

test("an ExtendedSceneEnvironment sharpens, smooths and dithers a scene as Qt's does", async ({ page }) => {
  // What is done to an edge: the top of the blue rectangle made sharper,
  // and the cube's side smoothed after it is drawn, or as it is drawn.
  const edges = [
    ["sharp()", [[[250, 29], [47, 63, 96]], [[250, 30], [134, 151, 255]]]],
    ["smooth()", [[[113, 75], [71, 176, 107]], [[114, 75], [77, 221, 115]]]],
    ["many()", [[[113, 75], [68, 139, 102]]]],
  ];
  for (const [call, points] of edges) {
    await open(page, "extended3d");
    await page.evaluate(`window.scene.${call}`);
    near(await painted(page, points, 6), points.map(([, colour]) => colour), call, 6);
  }
  // Dithering moves each number a little, and each by its own amount: the
  // side of the cube is 30, 101, 48 without it.
  const dithered = [
    [[20, 20], [64, 80, 96]],
    [[150, 100], [27, 101, 47]],
    [[151, 100], [31, 102, 46]],
    [[150, 101], [31, 102, 49]],
    [[262, 40], [128, 144, 255]],
  ];
  await open(page, "extended3d");
  await page.evaluate(() => window.scene.dithered());
  near(await painted(page, dithered, 2), dithered.map(([, colour]) => colour), "dithered", 1);
});

test("a scene's fog hides what is far and what is low, as Qt's does", async ({ page }) => {
  // The three cubes from the nearest back, the tall one near its top, at
  // its middle and near its foot, the two that take no light, of which the
  // second gives off light of its own, and what is behind them all.
  const at = [[40, 100], [115, 60], [135, 30], [170, 40], [170, 100], [170, 160], [215, 75], [215, 130], [270, 100]];
  const states = [
    // What is not lit is not in the fog, nor is what is behind the scene.
    ["", [[91, 155, 224], [168, 174, 193], [190, 160, 103], [176, 171, 163], [176, 171, 164], [176, 171, 163], [64, 192, 96], [196, 146, 96], [30, 47, 64]]],
    ["halved()", [[85, 154, 227], [154, 181, 225], [148, 157, 181], [175, 172, 168], [175, 172, 169], [175, 172, 168], [64, 192, 96], [201, 124, 97], [30, 47, 64]]],
    ["curved()", [[78, 154, 229], [150, 183, 232], [187, 159, 112], [173, 173, 172], [173, 173, 173], [173, 173, 172], [64, 192, 96], [200, 130, 97], [30, 47, 64]]],
    ["high()", [[150, 157, 179], [140, 188, 249], [78, 154, 230], [173, 173, 173], [183, 166, 141], [192, 160, 96], [64, 192, 96], [192, 157, 96], [30, 47, 64]]],
    // By its height a fog is as thick as it is whatever `density` and
    // `heightCurve` say.
    ["highCurved()", [[150, 157, 179], [140, 188, 249], [78, 154, 230], [173, 173, 173], [183, 166, 141], [192, 160, 96], [64, 192, 96], [192, 157, 96], [30, 47, 64]]],
    ["both()", [[150, 157, 179], [168, 174, 193], [190, 160, 103], [176, 171, 163], [183, 166, 141], [192, 160, 96], [64, 192, 96], [192, 157, 96], [30, 47, 64]]],
    ["through()", [[91, 155, 229], [168, 181, 224], [190, 160, 109], [176, 173, 171], [176, 173, 172], [176, 173, 171], [64, 192, 96], [199, 146, 97], [30, 47, 64]]],
    ["throughCurved()", [[91, 155, 230], [168, 187, 248], [190, 160, 124], [176, 173, 173], [176, 173, 173], [176, 173, 173], [64, 192, 96], [203, 146, 97], [30, 47, 64]]],
    // With no far end said the fog ends where the camera stops seeing,
    // which here is nearer than the last cube.
    ["far()", [[106, 155, 216], [188, 163, 123], [30, 47, 64], [180, 168, 150], [180, 169, 152], [180, 168, 150], [64, 192, 96], [192, 160, 96], [30, 47, 64]]],
    // Neither by how far nor by how high: no fog.
    ["neither()", [[78, 154, 230], [138, 188, 252], [78, 154, 230], [173, 173, 173], [173, 173, 173], [173, 173, 173], [64, 192, 96], [206, 97, 97], [30, 47, 64]]],
    ["off()", [[78, 154, 230], [138, 188, 252], [78, 154, 230], [173, 173, 173], [173, 173, 173], [173, 173, 173], [64, 192, 96], [206, 97, 97], [30, 47, 64]]],
  ];
  for (const [call, colours] of states) {
    await open(page, "fog3d");
    if (call) await page.evaluate(`window.scene.${call}`);
    near(await painted(page, at.map((point, index) => [point, colours[index]])), colours, call, 3);
  }
});

test("a table of instances has the entries Qt's has", async ({ page }) => {
  const read = async (call) => {
    await open(page, "instanced3d");
    if (call) await page.evaluate(`window.scene.${call}`);
    return page.evaluate(() => window.scene.read());
  };
  const list = [
    { position: [-110, 50, 0], scale: [1, 1, 1], rotation: [1, 0, 0, 0], color: [1, 0.217, 0.051, 1], data: [1, 2, 3, 4] },
    { position: [-50, 50, 0], scale: [0.5, 1, 1], rotation: [0.966, 0, 0, 0.259], color: [0.051, 1, 0.217, 1], data: [0, 0, 0, 0] },
    { position: [10, 50, 0], scale: [1, 1, 1], rotation: [0.924, 0, 0, 0.383], color: [0.051, 0.217, 1, 1], data: [0, 0, 0, 0] },
    { position: [70, 50, 0], scale: [1, 1, 1], rotation: [1, 0, 0, 0], color: [1, 1, 1, 0.502], data: [0, 0, 0, 0] },
  ];
  // What a delegate reads of its row, and where an InstanceRepeater put it:
  // not where the delegate says.
  const nodes = list.map(({ position, scale, rotation, color }, at) => ({ position, scale, rotation, tone: color, at, where: position }));
  // An entry's colour reads in linear light. What is asked of an entry
  // there is none of is nothing. A table made up from a seed is the one Qt
  // makes up from it.
  near(await read(), {
    count: [4, 5, 4, 4],
    list,
    past: [0, 0, 0],
    random: [
      { position: [35.919, 5.17, 0], scale: [0.977, 0.977, 0.977], rotation: [0.913, 0, 0, 0.408], color: [0.077, 0.343, 0.125, 1], data: [0.495, 8.174, 42.268, 569.684] },
      { position: [37.562, 29.275, 0], scale: [0.897, 0.897, 0.897], rotation: [0.933, 0, 0, 0.359], color: [0.156, 0.874, 0.069, 1], data: [0.225, 3.737, 61.893, 34.48] },
      { position: [23.589, -9.18, 0], scale: [1.333, 1.333, 1.333], rotation: [0.93, 0, 0, 0.367], color: [0.089, 0.931, 0.055, 1], data: [0.488, 5.257, 55.835, 350.173] },
      { position: [17.091, 18.526, 0], scale: [1.151, 1.151, 1.151], rotation: [0.926, 0, 0, 0.378], color: [0.196, 0.086, 0.928, 1], data: [0.691, 2.84, 86.09, 795.101] },
      { position: [40.399, 7.173, 0], scale: [1.078, 1.078, 1.078], rotation: [0.968, 0, 0, 0.252], color: [0.129, 0.592, 0.044, 1], data: [0.48, 0.736, 47.172, 1.832] },
    ],
    nodes,
  });
  // A table told to draw two of its entries still has four, and so has
  // the InstanceRepeater; an InstanceModel says it has two rows.
  near(await read("fewer()"), { count: [4, 5, 4, 2], list, nodes });
  // An entry that changes is a table that changes: the nodes are made anew.
  const moved = { position: [-50, 20, 0], color: [1, 1, 0, 1] };
  near(await read("moved()"), {
    count: [4, 5, 4, 4],
    list: list.map((entry, at) => (at === 1 ? { ...entry, ...moved } : entry)),
    nodes: nodes.map((node, at) => (at === 1 ? { ...node, position: moved.position, tone: moved.color, where: moved.position } : node)),
  });
  near(await read("seeded()"), {
    count: [4, 3, 4, 4],
    random: [
      { position: [-25.994, 0.894, 0], scale: [0.601, 0.601, 0.601], rotation: [0.994, 0, 0, 0.109], color: [0.192, 0.185, 0.161, 1], data: [0.035, 2.176, 38.026, 469.28] },
      { position: [-44.803, 38.2, 0], scale: [1.324, 1.324, 1.324], rotation: [0.991, 0, 0, 0.132], color: [0.025, 0.084, 0.055, 1], data: [0.114, 1.943, 52.496, 679.417] },
      { position: [14.777, 32.256, 0], scale: [1.339, 1.339, 1.339], rotation: [0.985, 0, 0, 0.171], color: [0.18, 0.38, 0.245, 1], data: [0.932, 3.254, 7.261, 666.115] },
    ],
  });
  // Colours mixed by hue, how strong and how bright, one number drawn for
  // all four: which leaves three fewer for each entry, so every entry after
  // the first is another.
  near(await read("coloured()"), {
    random: [
      { position: [35.919, 5.17, 0], scale: [0.977, 0.977, 0.977], rotation: [0.913, 0, 0, 0.408], color: [0.143, 0.539, 0.016, 1], data: [0.566, 2.988, 84.779, 494.575] },
      { position: [31.742, -6.186, 0], scale: [1.376, 1.376, 1.376], rotation: [0.952, 0, 0, 0.307], color: [0.014, 0.893, 0.468, 1], data: [0.974, 4.68, 18.896, 934.305] },
      { position: [-31.04, -17.417, 0], scale: [0.874, 0.874, 0.874], rotation: [0.838, 0, 0, 0.546], color: [0.328, 0.439, 0.016, 1], data: [0.873, 8.329, 18.508, 924.219] },
      { position: [-2.136, -3.141, 0], scale: [0.653, 0.653, 0.653], rotation: [0.916, 0, 0, 0.401], color: [0.1, 0.57, 0.016, 1], data: [0.35, 6.709, 73.157, 561.977] },
      { position: [15.143, 37.131, 0], scale: [0.993, 0.993, 0.993], rotation: [0.727, 0, 0, 0.686], color: [0.211, 0.499, 0.016, 1], data: [0.691, 2.84, 86.09, 795.101] },
    ],
  });
  // By hue, how strong and how light: the same numbers drawn as at first.
  const lighter = await read("lighter()");
  near(
    lighter.random.map((entry) => entry.color),
    [
      [0.101, 0.46, 0.004, 1],
      [0.465, 0.139, 0, 1],
      [0.159, 0.446, 0, 1],
      [0.713, 0.105, 0.049, 1],
      [0.389, 0.287, 0.001, 1],
    ],
    "lighter",
  );
  // On a grid no entry is in a cell next to one taken: the third is where
  // it first found room.
  near(await read("gridded()"), {
    count: [4, 5, 4, 4],
    random: [
      { position: [35.919, 5.17, 0], scale: [0.977, 0.977, 0.977], rotation: [0.913, 0, 0, 0.408], color: [0.077, 0.343, 0.125, 1], data: [0.495, 8.174, 42.268, 569.684] },
      { position: [37.562, 29.275, 0], scale: [0.897, 0.897, 0.897], rotation: [0.933, 0, 0, 0.359], color: [0.156, 0.874, 0.069, 1], data: [0.225, 3.737, 61.893, 34.48] },
      { position: [33.288, -25.194, 0], scale: [0.979, 0.979, 0.979], rotation: [0.993, 0, 0, 0.12], color: [0.162, 0.267, 0.302, 1], data: [0.35, 6.709, 73.157, 561.977] },
      { position: [15.143, 37.131, 0], scale: [0.993, 0.993, 0.993], rotation: [0.727, 0, 0, 0.686], color: [0.087, 0.49, 0.116, 1], data: [0.795, 9.04, 58.966, 958.519] },
      { position: [7.816, -19.236, 0], scale: [0.825, 0.825, 0.825], rotation: [0.995, 0, 0, 0.098], color: [0.038, 0.259, 0.029, 1], data: [0.002, 4.523, 30.068, 96.009] },
    ],
  });
});

test("a FileInstancing has the entries Qt reads of its file", async ({ page }) => {
  await open(page, "filed3d");
  // What is left off the end of an entry's numbers is nothing, what is not
  // an Instance is passed over, and a turn may be a quaternion. The same
  // table as Qt's `instancer` keeps it is the same entries.
  const entries = [
    { position: [0, 200, 0], scale: [0.75, 0.75, 0.75], rotation: [1, 0, 0, 0], color: [1, 0.623, 0.213, 1], data: [20, 20, 0, 0] },
    { position: [0, -100, 0], scale: [0.5, 2, 0.5], rotation: [1, 0, 0, 0], color: [1, 0, 0, 1], data: [0, 0, 0, 0] },
    { position: [10, -200, 30], scale: [1, 1, 1], rotation: [0.866, 0, 0, 0.5], color: [0.259, 0, 0, 1], data: [10, 40, 0, 5] },
    { position: [1, 2, 3], scale: [1, 1, 1], rotation: [0.924, 0, 0, 0.383], color: [1, 1, 1, 0.502], data: [0, 0, 0, 0] },
  ];
  await expect.poll(() => page.evaluate(() => window.scene.read().count)).toEqual([4, 4, 0]);
  near(await page.evaluate(() => window.scene.read()), { count: [4, 4, 0], written: entries, kept: entries });
});

test("a Model is drawn once for each entry of its table, where Qt draws it", async ({ page }) => {
  const ground = [64, 80, 96];
  const states = [
    // Along the top, a rectangle for each entry, of the entry's colour: the
    // last wholly white, though its entry is half seen through. Below, two
    // cubes that are lit, the second times its entry's red; two rectangles
    // somewhat seen through, the later entry over the earlier; and five put
    // at random.
    [
      "",
      [
        [[20, 20], ground],
        [[50, 36], [255, 128, 64]],
        [[104, 38], [64, 255, 128]],
        [[172, 32], [64, 128, 255]],
        [[248, 36], [255, 255, 255]],
        [[34, 134], [159, 159, 159]],
        [[26, 140], [174, 174, 174]],
        [[40, 148], [79, 79, 79]],
        [[88, 132], [188, 70, 70]],
        [[104, 138], [101, 33, 33]],
        [[130, 130], [208, 20, 24]],
        [[146, 146], [51, 5, 198]],
        [[160, 146], [16, 20, 216]],
        [[272, 114], [110, 240, 74]],
        [[252, 122], [122, 83, 247]],
        [[258, 148], [84, 247, 66]],
      ],
    ],
    // Two of the four.
    ["fewer()", [[[50, 36], [255, 128, 64]], [[104, 38], [64, 255, 128]], [[172, 32], ground], [[248, 36], ground]]],
    ["moved()", [[[104, 38], ground], [[102, 74], [255, 255, 0]]]],
    // A table that says something of it is seen through shows it.
    ["sheer()", [[[248, 36], [160, 168, 176]]]],
    // Put in order, the farther entry is drawn first.
    ["sorted()", [[[130, 130], [208, 20, 24]], [[146, 146], [196, 5, 53]], [[160, 146], [16, 20, 216]]]],
    ["seeded()", [[[196, 100], [44, 82, 66]], [[254, 106], [117, 165, 135]], [[210, 146], [121, 119, 112]], [[272, 114], ground]]],
    ["coloured()", [[[244, 106], [127, 187, 34]], [[270, 146], [31, 243, 182]], [[232, 150], [89, 198, 34]], [[202, 162], [155, 177, 34]]]],
    ["lighter()", [[[272, 114], [181, 104, 0]], [[252, 122], [219, 91, 62]], [[274, 136], [167, 146, 1]], [[258, 148], [111, 178, 0]]]],
    ["gridded()", [[[244, 106], [83, 186, 96]], [[270, 138], [78, 158, 99]], [[238, 166], [55, 139, 48]], [[272, 170], [112, 141, 149]]]],
    // A model's position moves its whole table; with the model as its own
    // `instanceRoot` it moves each entry in the entry's own place, and
    // with the node above it as the root that node's size does too.
    ["rooted()", [[[50, 36], [255, 128, 64]], [[104, 34], [64, 255, 128]], [[176, 22], [64, 128, 255]], [[154, 58], ground]]],
    ["held()", [[[68, 40], [255, 128, 64]], [[26, 40], ground], [[110, 38], [64, 255, 128]], [[176, 26], [64, 128, 255]], [[216, 52], [255, 255, 255]], [[258, 38], ground]]],
  ];
  for (const [call, points] of states) {
    await open(page, "instanced3d");
    if (call) await page.evaluate(`window.scene.${call}`);
    near(await painted(page, points), points.map(([, colour]) => colour), call, 3);
  }
});

test("a light with a scope lights what is in it, as Qt's does", async ({ page }) => {
  // What is behind, the two rectangles in the node the red light is for,
  // the one no light is for, and the model the green light is for with the
  // model inside it.
  const at = [[20, 20], [40, 100], [95, 100], [150, 100], [205, 100], [260, 100]];
  const states = [
    // What a light adds wherever a surface faces it adds in its scope only.
    ["", [[11, 11, 11], [218, 124, 153], [218, 124, 153], [124, 124, 124], [124, 218, 124], [124, 218, 124]]],
    ["unscoped()", [[11, 11, 11], [218, 124, 153], [218, 124, 153], [218, 124, 153], [218, 218, 153], [218, 218, 153]]],
    ["rescoped()", [[11, 11, 11], [124, 124, 124], [124, 124, 124], [124, 124, 124], [218, 218, 153], [218, 218, 153]]],
    // A light for a node with nothing in it lights nothing.
    ["hidden()", [[11, 11, 11], [124, 124, 124], [124, 124, 124], [124, 124, 124], [124, 218, 124], [124, 218, 124]]],
  ];
  for (const [call, colours] of states) {
    await open(page, "scoped3d");
    if (call) await page.evaluate(`window.scene.${call}`);
    near(await painted(page, at.map((point, index) => [point, colours[index]])), colours, call, 3);
  }
});

test("the round shapes Qt has of its own are Qt's, with a picture where Qt has it", async ({ page }) => {
  await open(page, "round3d");
  // A place in the view, the colour there, and what is found there: which
  // model, how far off, where in the picture, where in the model's own
  // space and which way the triangle faces. The picture is four colours
  // across its upper half and four across its lower.
  const places = [
    // A sphere from its front: the middle of the picture is at the front.
    [[35, 35], [0, 255, 0], "sphere", 466.672, [0.433, 0.624], [-18.75, 18.75, 41.66], [-0.391, 0.396, 0.831]],
    [[65, 35], [0, 0, 255], "sphere", 466.672, [0.567, 0.624], [18.75, 18.75, 41.66], [0.391, 0.396, 0.831]],
    [[35, 65], [255, 255, 255], "sphere", 466.672, [0.433, 0.376], [-18.75, -18.75, 41.66], [-0.391, -0.396, 0.831]],
    [[65, 65], [0, 255, 255], "sphere", 466.672, [0.567, 0.376], [18.75, -18.75, 41.66], [0.391, -0.396, 0.831]],
    // A cylinder from its side: a strip of the picture's lower half goes
    // round it from its left.
    [[135, 30], [128, 128, 128], "cylinder", 463.068, [0.189, 0.342], [-18.75, 25, 46.164], [-0.383, 0, 0.924]],
    [[165, 30], [255, 255, 255], "cylinder", 463.068, [0.311, 0.342], [18.75, 25, 46.164], [0.383, 0, 0.924]],
    [[135, 70], [128, 128, 128], "cylinder", 463.068, [0.189, 0.158], [-18.75, -25, 46.164], [-0.383, 0, 0.924]],
    [[165, 70], [255, 255, 255], "cylinder", 463.068, [0.311, 0.158], [18.75, -25, 46.164], [0.383, 0, 0.924]],
    // A cone from its side, and from under it: the picture lies on it as
    // seen from above.
    [[225, 70], [128, 128, 128], "cone", 483.582, [0.187, 0.295], [-31.25, 25, 20.522], [-0.763, 0.446, 0.468]],
    [[242, 70], [255, 255, 255], "cone", 471.177, [0.4, 0.14], [-10, 25, 36.029], [-0.209, 0.446, 0.87]],
    [[258, 70], [0, 255, 255], "cone", 471.177, [0.6, 0.14], [10, 25, 36.029], [0.209, 0.446, 0.87]],
    [[275, 70], [255, 0, 255], "cone", 483.582, [0.813, 0.295], [31.25, 25, 20.522], [0.763, 0.446, 0.468]],
    [[243, 40], [255, 255, 255], "cone", 486.772, [0.412, 0.335], [-8.75, 62.5, 16.535], [-0.468, 0.446, 0.763]],
    [[257, 40], [0, 255, 255], "cone", 486.772, [0.588, 0.335], [8.75, 62.5, 16.535], [0.468, 0.446, 0.763]],
    [[335, 35], [255, 255, 255], "foot", 500.02, [0.312, 0.312], [-18.75, 0.025, 18.75], [0, -1, 0]],
    [[365, 35], [0, 255, 255], "foot", 500.02, [0.688, 0.312], [18.75, 0.025, 18.75], [0, -1, 0]],
    [[335, 65], [0, 255, 0], "foot", 500.02, [0.312, 0.688], [-18.75, 0.025, -18.75], [0, -1, 0]],
    [[365, 65], [0, 0, 255], "foot", 500.02, [0.688, 0.688], [18.75, 0.025, -18.75], [0, -1, 0]],
    // A cylinder from over it and from under it: an end is a round piece
    // of the picture's upper left quarter, the other way across on top.
    [[35, 135], [0, 255, 0], "top", 460.016, [0.351, 0.664], [-18.75, 49.98, -18.75], [0, 1, 0]],
    [[65, 135], [255, 0, 0], "top", 460.016, [0.164, 0.649], [18.75, 49.98, -18.75], [0, 1, 0]],
    [[35, 165], [0, 255, 0], "top", 460.016, [0.336, 0.851], [-18.75, 49.98, 18.75], [0, 1, 0]],
    [[65, 165], [255, 0, 0], "top", 460.016, [0.149, 0.836], [18.75, 49.98, 18.75], [0, 1, 0]],
    [[135, 135], [255, 0, 0], "bottom", 460.016, [0.164, 0.851], [-18.75, -49.98, 18.75], [0, -1, 0]],
    [[165, 135], [0, 255, 0], "bottom", 460.016, [0.351, 0.836], [18.75, -49.98, 18.75], [0, -1, 0]],
    [[135, 165], [255, 0, 0], "bottom", 460.016, [0.149, 0.664], [-18.75, -49.98, -18.75], [0, -1, 0]],
    [[165, 165], [0, 255, 0], "bottom", 460.016, [0.336, 0.649], [18.75, -49.98, -18.75], [0, -1, 0]],
    // A cone from over it, and a sphere from over it, the last near its
    // pole.
    [[232, 138], [0, 255, 0], "point", 463.4, [0.275, 0.65], [-22.5, 45.75, -15], [-0.763, 0.446, -0.468]],
    [[268, 138], [0, 0, 255], "point", 463.4, [0.725, 0.65], [22.5, 45.75, -15], [0.763, 0.446, -0.468]],
    [[232, 162], [255, 255, 255], "point", 463.4, [0.275, 0.35], [-22.5, 45.75, 15], [-0.763, 0.446, 0.468]],
    [[268, 162], [0, 255, 255], "point", 463.4, [0.725, 0.35], [22.5, 45.75, 15], [0.763, 0.446, 0.468]],
    [[335, 135], [255, 0, 0], "pole", 466.606, [0.125, 0.82], [-18.75, 41.743, -18.75], [-0.41, 0.827, -0.385]],
    [[365, 135], [255, 255, 0], "pole", 466.606, [0.875, 0.82], [18.75, 41.743, -18.75], [0.41, 0.827, -0.385]],
    [[335, 165], [0, 255, 0], "pole", 466.606, [0.375, 0.82], [-18.75, 41.743, 18.75], [-0.41, 0.827, 0.385]],
    [[365, 165], [0, 0, 255], "pole", 466.606, [0.625, 0.82], [18.75, 41.743, 18.75], [0.41, 0.827, 0.385]],
    [[352, 148], [255, 255, 0], "pole", 460.53, [0.874, 0.977], [2.5, 49.337, -2.5], [0.069, 0.996, -0.065]],
  ];
  near(await painted(page, places), places.map(([, colour]) => colour), "painted", 3);
  near(
    await page.evaluate(() => window.scene.read()),
    places.map(([, , hit, distance, uv, local, normal]) => ({ hit, distance, uv, local, normal })),
  );
});

test("a View3D finds what Qt finds at a place and along a ray", async ({ page }) => {
  const nothing = { hit: null, type: 0, distance: 0, uv: [0, 0], scene: [0, 0, 0], local: [0, 0, 0], normal: [0, 0, 0], sceneNormal: [0, 0, 0], instance: -1, item: false };
  // What was met: how far off, where in the shape's picture, where in the
  // scene and in the model's own space, which way the triangle faces in
  // each, and which entry of a table it is.
  const met = (hit, distance, uv, scene, local, normal, sceneNormal, instance = 0) => ({ hit, type: 1, distance, uv, scene, local, normal, sceneNormal, instance, item: false });
  const cube = met("cube", 469.28, [0.244, 0.614], [-80, 0, 30.72], [-25.6, 11.374, 50], [0, 0, 1], [0.94, -0.684, 1.628]);
  const behind = met("behind", 700, [0.5, 0.5], [-80, 0, -200], [0, 0, 0], [0, 0, 1], [0, 0, 1]);
  // Flat on: the cube, the rectangle behind it beside it, the globe
  // through the pane, nothing where a rectangle faces away, the one not
  // shown and the one shown through wholly, each entry of a table, and
  // nothing at the edge and outside the view. Which way a triangle faces
  // in the scene is longer than one as the model is smaller than its
  // shape. Last, the strip that is not shown, of a shape nothing shown is
  // picked by: the box round it.
  const flat = [
    cube,
    met("behind", 700, [0.167, 0.083], [-120, -50, -200], [-33.333, -41.667, 0], [0, 0, 1], [0, 0, 1]),
    met("globe", 451.273, [0.52, 0.539], [76, 36, 48.727], [6, 6, 48.727], [0.063, 0.094, 0.994], [0.063, 0.094, 0.994]),
    nothing,
    met("unseen", 500, [0.5, 0.5], [0, -60, 0], [0, 0, 0], [0, 0, 1], [0, 0, 1]),
    met("faint", 500, [0.5, 0.5], [0, 10, 0], [0, 0, 0], [0, 0, 1], [0, 0, 1]),
    met("many", 500, [0.5, 0.5], [-100, 80, 0], [0, 0, 0], [0, 0, 1], [0, 0, 1]),
    met("many", 500, [0.5, 0.5], [100, 80, 0], [0, 0, 0], [0, 0, 1], [0, 0, 1], 1),
    nothing,
    nothing,
    nothing,
    met("cube", 476.624, [0.594, 0.747], [-60, 10, 23.376], [9.388, 24.676, 50], [0, 0, 1], [0.94, -0.684, 1.628]),
    met("behind", 700, [1, 0.583], [-20, 10, -200], [50, 8.333, 0], [0, 0, 1], [0, 0, 1]),
    nothing,
    met("hidden", 500, [0.5, 0.562], [100, -50, 0], [0, 112.5, 0], [0, 0, 0], [0, 0, 0]),
  ];
  // With everything shown and for picking, the pane is before the globe
  // and the strip is met at its triangles.
  const shown = flat.map((found, index) => ({ 2: met("pane", 400, [0.7, 0.7], [76, 36, 100], [20, 20, 0], [0, 0, 1], [0, 0, 1]), 14: met("hidden", 500, [0.5, 0.562], [100, -50, 0], [0, 112.5, 0], [0, 0, 1], [0, 0, 1]) })[index] ?? found);
  // Through a camera with depth, from where the camera is.
  const deep = [
    nothing,
    nothing,
    nothing,
    nothing,
    nothing,
    met("globe", 365.35, [0.392, 0.418], [40, 17.402, 37.142], [-30, -12.598, 37.142], [-0.612, -0.278, 0.74], [-0.612, -0.278, 0.74]),
    nothing,
    nothing,
    nothing,
    nothing,
    nothing,
    met("cube", 382.365, [0.086, 0.851], [-84.972, 17.866, 41.1], [-41.427, 35.14, 50], [0, 0, 1], [0.94, -0.684, 1.628]),
    met("faint", 405.414, [0.243, 0.622], [-6.428, 13.041, 0], [-25.712, 12.165, 0], [0, 0, 1], [0, 0, 1]),
    met("globe", 363.821, [0.545, 0.699], [81.129, 58.905, 38.513], [11.129, 28.905, 38.513], [0.256, 0.561, 0.787], [0.256, 0.561, 0.787]),
    nothing,
  ];
  // Along a ray of the scene's own, whichever camera there is: the cube
  // from before it, and from its left its far side and then the globe.
  const ray = met("cube", 265.077, [0.209, 0.747], [-80, 10, 34.923], [-29.102, 24.676, 50], [0, 0, 1], [0.94, -0.684, 1.628]);
  const rays = [met("cube", 87.751, [0.882, 0.453], [-112.249, 5, -10], [-38.214, -4.723, -50], [0, 0, -1], [-0.94, 0.684, -1.628]), met("globe", 228.604, [0.212, 0.331], [28.604, 5, -10], [-41.396, -25, -10], [-0.834, -0.508, -0.214], [-0.834, -0.508, -0.214])];
  // What is found at every twentieth pixel, by the first letter of its
  // name and the entry of its table.
  const states = [
    [[], { picks: flat, all: [cube, behind], swept: [
        "..m0.........m1..",
        "..m0.......ggm1..",
        "bbbbbbb..gggg..",
        "bbccccb..gggg..",
        "bbccccbf.gggg..",
        "bccccbb...gg...",
        "bccccbb.....h..",
        "bbbbbbbu....h..",
        ".......u....h..",
        "............h..",
      ] }],
    [["shown"], { picks: shown, all: [cube, behind], swept: [
        "..m0.........m1..",
        "..m0.......ggm1..",
        "bbbbbbb..gggg..",
        "bbccccb..gppg..",
        "bbccccbf.gggg..",
        "bccccbb...gg...",
        "bccccbb.....hs.",
        "bbbbbbbu....hs.",
        ".......u....hs.",
        "............hs.",
      ] }],
    [["deep"], { picks: deep, all: [], swept: [
        "...............",
        "...............",
        "...............",
        ".....bbgg......",
        "....ccfgg......",
        "....cc.........",
        "...............",
        "...............",
        "...............",
        "...............",
      ] }],
    [["deep", "shown"], { picks: deep, all: [], swept: [
        "...............",
        "...............",
        "...............",
        ".....bbgg......",
        "....ccfgp......",
        "....cc.........",
        "...............",
        "...............",
        "...............",
        "...............",
      ] }],
  ];
  for (const [calls, found] of states) {
    await open(page, "picked3d");
    await expect.poll(() => page.evaluate(() => window.scene.loaded())).toBe(true);
    for (const call of calls) await page.evaluate((name) => window.scene[name](), call);
    const read = await page.evaluate(() => window.scene.read());
    near(read, { ...found, none: 0, ray, rays }, calls.join(" "));
  }
});

test("a ReflectionProbe says of itself what Qt's says", async ({ page }) => {
  await open(page, "reflection3d");
  expect(await page.evaluate(() => window.scene.read())).toEqual({
    plain: { quality: 1, clearColor: "#00000000", refreshMode: 1, timeSlicing: 0, parallaxCorrection: false, boxSize: [0, 0, 0], boxOffset: [0, 0, 0], debugView: false, texture: null, scenePosition: [0, 0, 0], scheduleUpdate: "function" },
    asked: { quality: 4, clearColor: "#102030", refreshMode: 0, timeSlicing: 2, parallaxCorrection: true, boxSize: [3000, 0, 0], boxOffset: [0, 990, 0], debugView: false, texture: null, scenePosition: [10, 5, 0], scheduleUpdate: "function" },
    enums: [0, 1, 2, 3, 4, 0, 1, 0, 1, 2],
  });
});

// Where a ball that mirrors is looked at: its middle, to the right, left,
// top and bottom of it, between right and top, by its rim, and past it.
const SPOTS = [[50, 50], [78, 50], [22, 50], [50, 22], [50, 78], [70, 30], [50, 13], [5, 5]];
const spotted = (views) => views.flatMap((colours, view) => colours.flatMap((colour, spot) => (colour ? [[[(view % 4) * 100 + SPOTS[spot][0], Math.floor(view / 4) * 100 + SPOTS[spot][1]], colour]] : [])));
const BLACK = [0, 0, 0];
const RED = [255, 0, 0];
const GREEN = [0, 255, 0];
const BLUE = [0, 0, 255];
const YELLOW = [255, 255, 0];
const BROWN = [128, 64, 30];
const BEHIND = [30, 64, 96];

// Every number here is what Qt 6.11 paints of the same scene.
test("a model mirrors what is round a ReflectionProbe, as Qt has it mirror", async ({ page }) => {
  await open(page, "mirrors3d");
  const mirror = [BROWN, RED, GREEN, BLUE, YELLOW, BLACK, BLACK, BEHIND];
  const points = spotted([
    // A ball of metal between four walls, one behind the camera: each wall
    // where the ball faces it, and nothing between them.
    mirror,
    // One that is not to mirror does not.
    [BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BEHIND],
    // Where nothing is seen is the probe's own colour, taken as it is and
    // not as a colour of the scene is.
    [BROWN, RED, GREEN, BLUE, YELLOW, [188, 188, 188], [188, 188, 188], BEHIND],
    // The box of a probe says who mirrors by it, not what is seen: one the
    // ball is not all in, and one moved off whose box still meets the ball,
    // which sees the left wall no longer past the ball itself.
    mirror,
    [BROWN, RED, BLACK, BLUE, YELLOW, BLACK, BLACK, BEHIND],
    // A rougher ball mirrors a blur.
    [[65, 46, 23], [159, 22, 23], [27, 161, 21], [23, 24, 159], [159, 159, 0], [80, 0, 76], [20, 23, 73], BEHIND],
    // What is not to be mirrored is not.
    [BROWN, BLACK, GREEN, BLUE, YELLOW, BLACK, BLACK, BEHIND],
    // What a probe sees is from where it is: as if round the ball, unless
    // it is to be put right by the probe's box.
    [BROWN, RED, BLACK, BLACK, BLACK, RED, BLACK, BEHIND],
    [BROWN, RED, BLACK, BLUE, YELLOW, RED, BLACK, BEHIND],
    // One that is no metal takes its light from all round the probe.
    [[83, 72, 48], [123, 41, 34], [52, 119, 34], [53, 44, 111], [124, 119, 0], [97, 12, 95], [57, 53, 127], BEHIND],
    // A smaller picture shows the same.
    mirror,
    // And the ball's own colour is on what it mirrors.
    [[62, 27, 9], [133, 0, 0], [0, 132, 0], [0, 0, 132], [133, 133, 0], BLACK, BLACK, BEHIND],
  ]);
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
});

// And here.
test("a ReflectionProbe sees the scene as it is lit, and the nearest whose box a model is in is its probe", async ({ page }) => {
  await open(page, "mirrored3d");
  const mirror = [BROWN, RED, GREEN, BLUE, YELLOW, BLACK, BLACK, BEHIND];
  const points = spotted([
    // The surroundings are seen where they are what is behind the scene,
    // and light nothing that mirrors by a probe either way. (What is behind
    // the first ball is not looked at: this camera sees a few pixels of the
    // surroundings spread over the view, and those not quite as Qt has
    // them.)
    [BROWN, RED, GREEN, BLUE, YELLOW, GREEN, [96, 160, 0], null],
    mirror,
    // Walls a light is on are seen as it lights them: only the bottom one
    // faces this light.
    [BLACK, BLACK, BLACK, BLACK, [219, 219, 8], BLACK, BLACK, BEHIND],
    // A DefaultMaterial: dull, with a shine added, and with a rough one.
    [[84, 73, 49], [124, 42, 34], [53, 121, 35], [53, 45, 113], [125, 121, 0], [98, 12, 97], [58, 54, 128], BEHIND],
    [[150, 96, 59], [255, 42, 34], [53, 255, 35], [53, 45, 255], YELLOW, [98, 12, 97], [58, 54, 128], BEHIND],
    // Of two probes the ball is in the box of, the one whose box has its
    // middle nearer the ball's: the second one's colour is grey.
    mirror,
    [BROWN, RED, GREEN, BLUE, YELLOW, [188, 188, 188], [188, 188, 188], BEHIND],
    // A box that does not meet the ball gives it nothing to mirror; one
    // moved back onto it from where the probe is does.
    [BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BEHIND],
    [BROWN, RED, BLACK, BLACK, BLACK, RED, BLACK, BEHIND],
    // What is mirrored is brought to the screen as the rest is.
    [[55, 13, 3], RED, GREEN, BLUE, YELLOW, BLACK, BLACK, [3, 13, 30]],
    [[109, 55, 25], [186, 0, 0], [0, 186, 0], [0, 0, 186], [186, 186, 0], [150, 150, 150], [150, 150, 150], [25, 55, 83]],
    [[101, 81, 53], [188, 45, 35], [53, 188, 38], [56, 45, 183], [188, 186, 0], [118, 14, 111], [60, 54, 136], BEHIND],
  ]);
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
});

// And here.
test("a ReflectionProbe that looks once looks again when it is asked to", async ({ page }) => {
  await open(page, "once3d");
  const sees = async (once, every) => {
    const points = [
      [[78, 50], once],
      [[22, 50], GREEN],
      [[178, 50], every],
      [[122, 50], GREEN],
    ];
    near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
  };
  await sees(RED, RED);
  await page.evaluate(() => window.scene.whiten());
  await sees(RED, [255, 255, 255]);
  await page.evaluate(() => window.scene.ask());
  await sees([255, 255, 255], [255, 255, 255]);
});

test("a vector's members are set one by one, and assigning it as one unbinds them", async ({ page }) => {
  const told = { old: [0, 0.5, 0], turned: [0, -70, 0], placed: [-50, 0, 0], x: -50 };
  const states = [
    [[], [0.5, 0, 1], [187, 0, 255]],
    [["dark"], [0.5, 0, 0], [187, 0, 0]],
    [["dark", "whole", "relit"], [0.2, 0.4, 0.6], [123, 169, 203]],
  ];
  for (const [calls, glow, colour] of states) {
    await open(page, "members3d");
    for (const call of calls) await page.evaluate((name) => window.scene[name](), call);
    near(await page.evaluate(() => window.scene.read()), { ...told, glow }, calls.join(" "));
    const points = [
      [[50, 50], colour],
      [[150, 50], [0, 187, 0]],
      [[100, 50], [11, 11, 11]],
    ];
    near(await painted(page, points), points.map(([, colour]) => colour), calls.join(" "), 3);
  }
});

test("with the surroundings behind them, the nearer of two shapes is over the further", async ({ page }) => {
  await open(page, "behind3d");
  const points = [
    // The nearer square, both where they are, the further one, and the
    // surroundings at four places.
    [[50, 50], [255, 0, 0]],
    [[100, 50], [255, 0, 0]],
    [[150, 50], [0, 255, 0]],
    [[10, 10], [208, 0, 0]],
    [[190, 90], [208, 208, 208]],
    [[100, 10], [107, 136, 0]],
    [[30, 85], [122, 122, 122]],
  ];
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
});

// Every number here is what Qt 6.11 paints of the same scene.
test("a CustomMaterial is drawn by its own shaders, handed what Qt hands them", async ({ page }) => {
  await open(page, "custom3d");
  const points = [
    // Not lit: a colour handed over is in linear light, and is written as
    // the shader says it.
    [[25, 25], [8, 34, 81]],
    // Where its own corners put it, in what a real, an int, a bool and
    // vectors of two, three and four are to it.
    [[65, 25], [64, 255, 191]],
    [[85, 25], [255, 128, 64]],
    // A picture, read as it is.
    [[108, 18], [0, 255, 0]],
    [[115, 30], [255, 0, 0]],
    [[135, 30], [0, 0, 255]],
    [[110, 34], [255, 0, 0]],
    // Blended as it says: over what is there, added to it, and not at all,
    // whatever is seen through its colour or its model.
    [[175, 25], [152, 24, 24]],
    [[225, 25], [13, 13, 13]],
    [[275, 25], [255, 16, 16]],
    [[325, 25], [0, 255, 0]],
    // From behind, where it has both sides.
    [[375, 25], [255, 0, 255]],
    // Lit: as a PrincipledMaterial that gives back half is, beside it.
    [[25, 75], [68, 209, 111]],
    [[75, 75], [72, 210, 114]],
    [[125, 75], [253, 212, 129]],
    [[110, 60], [210, 175, 106]],
    [[140, 90], [255, 255, 158]],
    // By what its own functions make of the light all round and of each
    // light, of the shine of them, and of the sum.
    [[225, 75], [140, 33, 51]],
    [[275, 75], [128, 153, 126]],
    [[325, 75], [194, 0, 137]],
    // Its model seen through, and its colour: neither is blended unless
    // it says so.
    [[375, 75], [255, 27, 27]],
    [[125, 125], [255, 26, 26]],
    [[175, 125], [152, 29, 29]],
    // Raised by its corners, which lean the way it faces.
    [[15, 117], [181, 132, 6]],
    [[35, 117], [182, 181, 179]],
    [[25, 100], [182, 180, 179]],
    [[25, 140], [32, 32, 32]],
    // A picture as the colour of what is lit, and what it gives off.
    [[65, 125], [190, 10, 90]],
    [[85, 125], [11, 10, 205]],
    [[58, 118], [11, 190, 90]],
    // One of many, in its entry's colour: not lit, and lit.
    [[235, 115], [255, 55, 0]],
    [[265, 135], [0, 55, 255]],
    [[285, 115], [255, 133, 11]],
    [[315, 135], [11, 133, 255]],
    // What is behind it, as it is in linear light, and nothing where
    // nothing is.
    [[35, 175], [55, 13, 255]],
    [[15, 175], [0, 0, 0]],
    [[60, 175], [255, 128, 64]],
    // And how far it is: what is blended reads of what is behind it and
    // of nothing, what is not blended of itself.
    [[135, 175], [128, 13, 242]],
    [[110, 175], [255, 255, 0]],
    [[325, 175], [125, 13, 242]],
    // Where the eye is, which way it looks and how far it sees.
    [[225, 175], [128, 64, 51]],
    // Where a corner is to the eye, by the matrices, and the way it faces.
    [[265, 165], [167, 40, 128]],
    [[285, 165], [218, 40, 128]],
    [[265, 185], [0, 0, 128]],
    // How much of it is there, blended by itself.
    [[375, 175], [144, 16, 16]],
    [[300, 250], [32, 32, 32]],
  ];
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);

  // And what it is handed is what its properties are now.
  await page.evaluate(() => {
    window.scene.retint();
    window.scene.shifted();
  });
  const later = [
    [[25, 25], [81, 34, 8]],
    [[65, 25], [32, 255, 191]],
    [[85, 25], [255, 128, 64]],
    [[65, 7], [32, 32, 32]],
    [[65, 47], [32, 255, 191]],
    [[65, 51], [32, 32, 32]],
  ];
  near(await painted(page, later), later.map(([, colour]) => colour), "", 3);
});

// Every number here is what Qt 6.11 paints of the same scene.
test("a CustomMaterial says of a clear coat and of what it mirrors what Qt hears of them", async ({ page }) => {
  await open(page, "customcoat3d");
  // Of each ball: its middle, and three places off it. A ball here is of
  // other triangles than Qt's, so these are within four of Qt's.
  const balls = [
    // A whole coat, as a PrincipledMaterial has one.
    [[40, 50], [167, 34, 34]],
    [[30, 40], [73, 0, 0]],
    [[52, 58], [160, 5, 5]],
    [[22, 62], [22, 0, 0]],
    // As much of one as a property of the material says.
    [[120, 50], [189, 54, 54]],
    [[110, 40], [145, 2, 2]],
    [[132, 58], [162, 3, 3]],
    [[102, 62], [120, 0, 0]],
    // One that gives back more sooner as it turns, by a whole number less
    // a property, which Qt's shaders may write.
    [[200, 50], [206, 105, 105]],
    [[190, 40], [149, 3, 3]],
    [[212, 58], [152, 3, 3]],
    [[182, 62], [112, 0, 0]],
    // One that gives back half of that, and a fifth more.
    [[280, 50], [170, 53, 53]],
    [[270, 40], [137, 2, 2]],
    [[292, 58], [121, 0, 0]],
    [[262, 62], [110, 0, 0]],
    // One that faces another way than the ball does.
    [[360, 50], [78, 0, 0]],
    [[350, 40], [99, 0, 0]],
    [[372, 58], [13, 0, 0]],
    [[342, 62], [116, 0, 0]],
    // One over what bends light more.
    [[40, 150], [164, 54, 54]],
    [[30, 140], [88, 4, 4]],
    [[52, 158], [133, 10, 10]],
    [[22, 162], [10, 0, 0]],
    // One over a ball the piece turns: the coat is not turned with it.
    [[120, 150], [177, 60, 60]],
    [[110, 140], [106, 0, 0]],
    [[132, 158], [126, 0, 0]],
    [[102, 162], [28, 0, 0]],
    // No coat, and none where how much is given back is said, with what is
    // let through, which is nothing: a light's shine heeds neither.
    [[200, 150], [199, 77, 77]],
    [[190, 140], [178, 0, 0]],
    [[212, 158], [175, 0, 0]],
    [[182, 162], [158, 0, 0]],
    [[280, 150], [191, 44, 44]],
    [[270, 140], [178, 0, 0]],
    [[292, 158], [175, 0, 0]],
    [[262, 162], [158, 0, 0]],
    // A coat over the half of a ball that the other piece says, by what it
    // hands this one.
    [[360, 150], [159, 22, 22]],
    [[350, 140], [178, 4, 4]],
    [[372, 158], [57, 0, 0]],
    [[342, 162], [159, 3, 3]],
  ];
  near(await painted(page, balls, 4), balls.map(([, colour]) => colour), "", 4);
  // Under them, what mirrors by a ReflectionProbe, looked at where a
  // PrincipledMaterial that does is.
  const mirrors = spotted([
    // Metal mirrors each wall where it faces it.
    [BROWN, RED, GREEN, BLUE, YELLOW, BLACK, BLACK, BEHIND],
    // What is no metal takes its light from all round the probe.
    [[83, 73, 49], [124, 42, 34], [53, 120, 34], [53, 45, 112], [124, 120, 0], [98, 12, 96], [57, 53, 128], BEHIND],
    // What is black and gives nothing back mirrors by its coat alone.
    [[25, 7, 0], [69, 0, 0], [0, 67, 0], [0, 0, 67], [69, 69, 0], BLACK, BLACK, BEHIND],
    // And metal that gives back half and a fifth of what it would mirrors
    // that much.
    [[109, 53, 24], [219, 0, 0], [0, 218, 0], [0, 0, 218], [219, 219, 0], BLACK, BLACK, BEHIND],
  ]).map(([[x, y], colour]) => [[x, y + 200], colour]);
  near(await painted(page, mirrors), mirrors.map(([, colour]) => colour), "", 3);
});

test("a shape goes towards the targets of its mesh as Qt's does", async ({ page }) => {
  await open(page, "morph3d");
  const none = [32, 32, 32];
  const lit = grey(188);
  const turned = grey(170);
  const points = [
    // As the mesh has it: its middle, and beside and under it.
    [[50, 50], lit],
    [[68, 50], none],
    [[50, 68], none],
    // All the way to the first target: twice as wide and no taller, and
    // darker, as it faces away to the right.
    [[150, 50], turned],
    [[175, 50], turned],
    [[150, 68], none],
    // Half way to it.
    [[250, 50], grey(183)],
    [[270, 50], grey(183)],
    [[275, 50], none],
    [[250, 68], none],
    // Half way to the first and all the way to the second: each is gone
    // towards from the mesh's own.
    [[350, 50], grey(166)],
    [[370, 50], grey(167)],
    [[375, 50], none],
    [[350, 25], grey(168)],
    [[350, 78], grey(165)],
    [[350, 83], none],
    // A third target, which the mesh has not, is nothing: only the second
    // is gone towards.
    [[50, 150], turned],
    [[68, 150], none],
    [[50, 125], turned],
    [[50, 178], turned],
    // A target said to be of how the corners face moves them as well.
    [[150, 150], turned],
    [[175, 150], turned],
    [[150, 168], none],
    // A CustomMaterial with nothing to say of the corners is no different.
    [[250, 150], turned],
    [[275, 150], turned],
    [[250, 168], none],
    // One with something to say of them is where the mesh has it, and
    // faces as the target does.
    [[350, 150], grey(171)],
    [[368, 150], none],
    [[350, 168], none],
    // One that names what a target has is where it says and faces as the
    // mesh does: half way to the second target, however much either
    // weighs.
    [[50, 250], lit],
    [[68, 250], none],
    [[50, 230], lit],
    [[50, 225], none],
    [[50, 270], lit],
    // How the first target faces, as a colour, on a shape gone as far as
    // each target weighs.
    [[150, 250], [153, 0, 204]],
    [[175, 250], [153, 0, 204]],
    [[150, 230], [153, 0, 204]],
    [[150, 270], [153, 0, 204]],
    [[150, 275], none],
    // As far as each of as many as there are weighs.
    [[250, 250], lit],
    [[270, 250], lit],
    [[275, 250], none],
    [[250, 225], lit],
    [[250, 278], lit],
    // And a shape with no targets has nothing for one: it is where it was.
    [[350, 250], lit],
    [[362, 250], lit],
    [[368, 250], none],
    [[350, 268], none],
  ];
  near(await painted(page, points), points.map(([, colour]) => colour), "points", 3);
  // A target that comes to weigh more is gone towards further.
  await page.evaluate(() => window.scene.step(0));
  const after = [
    [[250, 50], turned],
    [[270, 50], turned],
    [[275, 50], turned],
    [[250, 68], none],
  ];
  near(await painted(page, after), after.map(([, colour]) => colour), "after", 3);
});

test("what is said to be farther or to hide is drawn over as Qt's is", async ({ page }) => {
  await open(page, "depthdrawn3d");
  // Half of each over what is behind it: the blue square and the red alone,
  // the red over the blue and the blue over the red.
  const blue = [16, 16, 144];
  const red = [144, 16, 16];
  const redOver = [136, 8, 72];
  const blueOver = [72, 8, 136];
  // Of each pair: where the blue square alone is, where both are, and
  // where the red alone is.
  const pairs = [
    // As they are, the red is drawn after the blue, which is farther.
    [blue, redOver, red],
    // Said to be 5 farther it is 25 farther, which is less than the 50
    // between them; said to be 8 it is 64, and drawn first.
    [blue, redOver, red],
    [blue, blueOver, red],
    // As the blue is drawn last when it is said to be 8 nearer.
    [blue, blueOver, red],
    // Drawn first and hiding what is behind it, the red leaves nothing of
    // the blue where both are.
    [blue, red, red],
    // And hiding what is behind it where it is, it is drawn last and hides
    // nothing.
    [blue, redOver, red],
    // Neither seen through, the nearer is drawn first: and is drawn over
    // by the farther where it does not hide,
    [[0, 0, 255], [0, 0, 255], [255, 0, 0]],
    // as where neither hides,
    [[0, 0, 255], [0, 0, 255], [255, 0, 0]],
    // unless it is said to be farther than the other.
    [[0, 0, 255], [255, 0, 0], [255, 0, 0]],
    // What is seen through and hides is still seen through.
    [blue, blueOver, red],
  ];
  const points = pairs.flatMap((colours, index) => {
    const x = 40 + 80 * (index % 5);
    const y = index < 5 ? 90 : 210;
    return colours.map((colour, at) => [[x + 25 * (at - 1), y + 25 * (at - 1)], colour]);
  });
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
});

test("what reads the picture of what is behind it is drawn before all that is seen through", async ({ page }) => {
  await open(page, "screenread3d");
  // The wall as what reads it draws it, and half as bright; the blue square
  // and the red, each half over the wall.
  const read = [13, 3, 55];
  const dim = [6, 1, 27];
  const blue = [64, 32, 142];
  const red = [191, 32, 15];
  // What reads and is half there, over the wall.
  const half = [78, 41, 50];
  // Of each pair: where the farther square alone is, where both are, and
  // where the nearer alone is.
  const pairs = [
    // Drawn first, it hides the blue behind it, which is drawn afterwards,
    [blue, read, read],
    // and the red before it is drawn over it.
    [read, [134, 1, 28], red],
    // Hiding nothing, it is drawn over by the blue.
    [blue, [6, 1, 155], read],
    // Of two that read the nearer is drawn last, and neither reads what
    // the other drew.
    [read, dim, dim],
    // What nothing is seen through is in the picture it reads.
    [[0, 255, 0], [255, 0, 0], read],
    // Put over what is there by halves it hides as much,
    [blue, half, half],
    // and is drawn before a red one that is said to be farther and hides.
    [half, [167, 20, 25], red],
    // Among those that read, one said to be nearer is drawn later.
    [read, read, dim],
  ];
  const points = pairs.flatMap((colours, index) => {
    const x = 80 + 80 * (index % 4);
    const y = index < 4 ? 90 : 210;
    return colours.map((colour, at) => [[x + 25 * (at - 1), y + 25 * (at - 1)], colour]);
  });
  points.push([[5, 5], [128, 64, 30]]);
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
});

// Every number here is what Qt 6.11 paints of the same scene. Solid warns of
// what follows two thousand things or more, and a warning fails a test: a
// view that followed each property of every node and of every material
// would follow thirteen thousand here.
test("a view of many nodes follows the few at the top, and draws what changes far inside", async ({ page }) => {
  await open(page, "manynodes3d");
  const none = [32, 32, 32];
  const places = [[155, 80], [29, 120], [47, 120], [29, 160], [371, 260], [29, 40], [20, 20]];
  const first = [[255, 0, 0], [255, 255, 255], [0, 0, 255], [255, 255, 255], [0, 0, 255], [255, 255, 255], none];
  near(await painted(page, places.map((place, index) => [place, first[index]])), first, "", 3);
  // One square of another colour, a row seen through by half and a row not
  // shown: the rest as they were.
  await page.evaluate(() => window.scene.step(0));
  const after = [[0, 255, 0], [144, 144, 144], [16, 16, 144], none, [0, 0, 255], [255, 255, 255], none];
  near(await painted(page, places.map((place, index) => [place, after[index]])), after, "", 3);
});

// The views of the scenes of effects are 100 by 75, four to a row, and
// these the places looked at in each: the surroundings, the nearer shape
// and the further one first. A place not looked at is null.
const PLACES = [[5, 5], [30, 37], [80, 27], [60, 37], [95, 70], [25, 5], [75, 5], [25, 70], [75, 70], [52, 20], [52, 55]];
const placed = (views) => views.flatMap((colours, view) => colours.flatMap((colour, place) => (colour ? [[[(view % 4) * 100 + PLACES[place][0], Math.floor(view / 4) * 75 + PLACES[place][1]], colour]] : [])));

// Every number here is what Qt 6.11 paints of the same scene.
test("an Effect is run over the picture of a scene, as Qt runs one", async ({ page }) => {
  await open(page, "effects3d");
  const points = placed([
    // No effect, and one that leaves the picture as it is.
    [[30, 64, 96], [255, 128, 64], [128, 192, 255], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96]],
    [[30, 64, 96], [255, 128, 64], [128, 192, 255], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96]],
    // What it reads is in linear light, and what it leaves is brought to
    // the screen after: half of it is not half as bright.
    [[19, 44, 69], [187, 93, 44], [93, 140, 187], [19, 44, 69], [19, 44, 69], [19, 44, 69], [19, 44, 69], [19, 44, 69], [19, 44, 69], [19, 44, 69], [19, 44, 69]],
    // A place in the picture: its first row is its bottom one.
    [[66, 247, 0], [150, 187, 0], [232, 208, 0], [204, 187, 0], [250, 69, 0], [138, 247, 0], [225, 247, 0], [138, 69, 0], [225, 69, 0], [191, 221, 0], [191, 139, 0]],
    // The effect's own properties: a colour in linear light on the left,
    // and a real, vectors of two and three and a bool on the right.
    [[50, 102, 153], [50, 102, 153], [161, 140, 203], [138, 44, 111], [138, 44, 111], [50, 102, 153], [138, 44, 111], [50, 102, 153], [138, 44, 111], [138, 44, 111], [138, 44, 111]],
    // How big the picture is, and what is drawn into.
    [[187, 164, 187], [187, 164, 187], [187, 164, 187], [187, 164, 187], [187, 164, 187], [187, 164, 187], [187, 164, 187], [187, 164, 187], [187, 164, 187], [187, 164, 187], [187, 164, 187]],
    // A rectangle its corners make smaller, black round it, reading where
    // they say.
    [[0, 0, 0], [30, 64, 96], [0, 0, 0], [219, 187, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [195, 250, 0], [195, 39, 0]],
    // A picture of its own, upright, by either word for a place in it.
    [[0, 255, 0], [0, 0, 255], [0, 0, 255], [255, 0, 0], [0, 0, 255], [0, 0, 255], [0, 0, 255], [0, 0, 255], [0, 0, 255], [255, 0, 0], [255, 0, 0]],
    // Through a picture of its own a quarter the size, of whole numbers
    // and not smoothed.
    [[28, 64, 96], [255, 128, 64], [128, 191, 255], [28, 64, 96], [28, 64, 96], [28, 64, 96], [28, 64, 96], [28, 64, 96], [28, 64, 96], [28, 64, 96], [28, 64, 96]],
    // Into one half the size: how big what is read is stays what it was.
    [[188, 165, 137], [188, 165, 137], [188, 165, 137], [188, 165, 137], [188, 165, 137], [188, 165, 137], [188, 165, 137], [188, 165, 137], [188, 165, 137], [188, 165, 137], [188, 165, 137]],
    // The picture it was given beside one it made, read by name, with a
    // property set for the pass.
    [[30, 64, 96], [255, 128, 64], [93, 140, 225], [21, 42, 151], [21, 42, 151], [30, 64, 96], [21, 42, 151], [30, 64, 96], [21, 42, 151], [21, 42, 151], [21, 42, 151]],
    // Two, one after the other: half as bright, then left for right.
    [[19, 44, 69], [19, 44, 69], [187, 93, 44], [187, 93, 44], [19, 44, 69], [19, 44, 69], [19, 44, 69], [19, 44, 69], [19, 44, 69], [187, 93, 44], [187, 93, 44]],
    // How far each place is, and how far the camera sees.
    [[255, 89, 243], [187, 89, 243], [137, 89, 243], [255, 89, 243], [255, 89, 243], [255, 89, 243], [255, 89, 243], [255, 89, 243], [255, 89, 243], [255, 89, 243], [255, 89, 243]],
    // Tone mapped another way: without an effect, and after one.
    [[25, 55, 83], [186, 109, 55], [109, 152, 186], [25, 55, 83], [25, 55, 83], [25, 55, 83], [25, 55, 83], [25, 55, 83], [25, 55, 83], [25, 55, 83], [25, 55, 83]],
    [[15, 38, 60], [150, 80, 38], [80, 118, 150], [15, 38, 60], [15, 38, 60], [15, 38, 60], [15, 38, 60], [15, 38, 60], [15, 38, 60], [15, 38, 60], [15, 38, 60]],
    // What it leaves seen through: what is behind the view shows. The
    // row its two halves meet in is one or the other.
    [[255, 255, 255], [255, 255, 255], [255, 255, 255], null, [35, 92, 85], [255, 255, 255], [255, 255, 255], [35, 92, 85], [35, 92, 85], [255, 255, 255], [35, 92, 85]],
  ]);
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
});

// And here.
test("the passes of an Effect read and draw into what Qt has them", async ({ page }) => {
  await open(page, "passes3d");
  const points = placed([
    // What a pass reads in place of the picture, the next does not.
    [[30, 64, 96], [255, 128, 64], [128, 192, 255], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96]],
    // How big what is read is, where that is a smaller picture.
    [[137, 121, 187], [137, 121, 187], [137, 121, 187], [137, 121, 187], [137, 121, 187], [137, 121, 187], [137, 121, 187], [137, 121, 187], [137, 121, 187], [137, 121, 187], [137, 121, 187]],
    // Half of 75 rows is 38, and 0.35 of them 26.
    [[231, 0, 0], [231, 0, 0], [231, 0, 0], [231, 0, 0], [231, 0, 0], [231, 0, 0], [231, 0, 0], [231, 0, 0], [231, 0, 0], [231, 0, 0], [231, 0, 0]],
    [[203, 0, 0], [203, 0, 0], [203, 0, 0], [203, 0, 0], [203, 0, 0], [203, 0, 0], [203, 0, 0], [203, 0, 0], [203, 0, 0], [203, 0, 0], [203, 0, 0]],
    // What a pass sets a property to, the next does not have.
    [[30, 64, 163], [255, 128, 149], [128, 192, 255], [30, 64, 163], [30, 64, 163], [30, 64, 163], [30, 64, 163], [30, 64, 163], [30, 64, 163], [30, 64, 163], [30, 64, 163]],
    // Past its edges the picture is as at them.
    [[30, 64, 96], [255, 128, 64], [30, 64, 96], [128, 192, 255], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96], [30, 64, 96]],
    // Nothing behind the scene: nothing is there in the picture either.
    [[0, 0, 0], [255, 255, 255], [255, 255, 255], null, [16, 48, 16], [0, 0, 0], [0, 0, 0], [16, 48, 16], [16, 48, 16], [0, 0, 0], [16, 48, 16]],
    // What a shader says before it is compiled, it does not say in what is
    // only written about it: half of each colour, and not twice.
    [[19, 44, 69], [187, 93, 44], [93, 140, 187], [19, 44, 69], [19, 44, 69], [19, 44, 69], [19, 44, 69], [19, 44, 69], [19, 44, 69], [19, 44, 69], [19, 44, 69]],
  ]);
  // Read past its right edge, the picture is not there again.
  points.push([[192, 112], [30, 64, 96]]);
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
});

// And here.
test("a Buffer of an Effect is what its name says, as Qt has one", async ({ page }) => {
  await open(page, "buffers3d");
  const views = [
    // No more than all of a colour is kept in a picture of whole numbers,
    // which a Buffer without a name says the effect leaves; more otherwise.
    [[128, 32, 12], [128, 32, 12]],
    [[255, 32, 13], [255, 32, 13]],
    // What is drawn into one without a name is what the effect leaves, and
    // what is read of it what the effect was given.
    [[0, 128, 0], [0, 128, 0]],
    [[3, 13, 30], [255, 55, 13]],
    // Two of one name are one; one nothing drew into is seen through; and
    // one of a name is the same to two effects.
    [[0, 128, 0], [0, 128, 0]],
    [[32, 96, 32], [32, 96, 32]],
    [[0, 128, 0], [0, 128, 0]],
    // One without a name is as big as the view.
    [[128, 96, 128], [128, 96, 128]],
    // Whole numbers go on to the effects after; the last pass to draw into
    // what the effect leaves says its kind, and what is read does not.
    [[128, 32, 12], [128, 32, 12]],
    [[255, 32, 13], [255, 32, 13]],
    [[128, 32, 12], [128, 32, 12]],
    [[255, 32, 13], [255, 32, 13]],
  ];
  const points = views.flatMap(([corner, middle], view) => {
    const [x, y] = [(view % 4) * 100, Math.floor(view / 4) * 75];
    return [
      [[x + 5, y + 5], corner],
      [[x + 50, y + 37], middle],
    ];
  });
  near(await painted(page, points), points.map(([, colour]) => colour), "", 3);
});

test("Quaternion makes the turns Qt's makes", async ({ page }) => {
  await open(page, "quaternion3d");
  near(await page.evaluate(() => window.scene.read()), {
    euler: [0.92, -0.081, -0.381, -0.033],
    eulerVector: [0.683, 0.5, 0.183, 0.5],
    axis: [0.94, 0.091, 0.183, 0.274],
    axisVector: [0.707, 0, 0.707, 0],
    none: [1, 0, 0, 0],
    two: [0.837, 0.224, 0.483, -0.129],
    three: [0.683, -0.183, 0.5, 0.5],
    look: [0.913, 0.183, -0.365, 0],
    lookFrom: [0.34, 0.752, -0.564, 0],
    ahead: [1, 0, 0, 0],
    behind: [0, 0, 1, 0],
    same: [0.707, 0, 0.707, 0],
    square: [0.92, -0.081, -0.381, -0.033],
  });
});

test("an object in space has states, and goes between them by its transitions", async ({ page }) => {
  await open(page, "states3d");
  const read = () => page.evaluate(() => window.scene.read());
  const step = (index) => page.evaluate((index) => window.scene.step(index), index);
  const closed = { door: ["closed", 0, 0, 0], lid: ["", 0, 0] };
  near(await read(), { ...closed, body: ["", "#a6a6a6", 0, 1, true] });
  // A door swings open over the better part of a second, and is not there at once;
  // what a Node's state changes of other things is changed with no
  // transition.
  await step(0);
  await expect.poll(async () => (await read()).door[0]).toBe("open");
  expect(Math.abs((await read()).door[1])).toBeLessThan(41);
  await expect.poll(async () => (await read()).door[1]).toBe(41);
  near(await read(), { door: ["open", 41, -18, 51], lid: ["", 0, 0], body: ["red", "#a21010", 0.5, 2, true] });
  // Everything a state changed is as it was once another is entered.
  await step(1);
  await expect.poll(async () => (await read()).door.join()).toBe("closed,0,0,0");
  near(await read(), { ...closed, body: ["dark", "#a6a6a6", 0, 1, false] });
  // A state that is named is entered when it is.
  near(await step(2), { lid: ["raised", -50, 40] });
  near(await step(3), { lid: ["", 0, 0] });
});

// A view is a picture upside down where Qt draws with OpenGL, which is
// how it is here: a ShaderEffectSource of it stands it up, unless it is
// told to mirror nothing. Each of the three is 100 across from 30, 150 and
// 270, and from 100 down: of a sheet in each quarter but one, where a small
// one is, before a grey.
test("a View3D is a picture in another's scene, the way up Qt has it", async ({ page }) => {
  await open(page, "viewmap3d");
  const GREY = grey(128);
  const PINK = [255, 0, 255];
  const quarters = (left, first, second, third, fourth, small) => [
    [[left + 25, 125], first],
    [[left + 75, 125], second],
    [[left + 25, 175], third],
    [[left + 75, 175], fourth],
    small,
  ];
  const seen = (first, other) => [
    // The view itself: its top row is the picture's bottom one.
    ...quarters(30, BLUE, GREY, first, GREEN, [[92, 137], YELLOW]),
    // Through a ShaderEffectSource it is as the view shows it,
    ...quarters(150, other, GREEN, BLUE, GREY, [[212, 162], YELLOW]),
    // and through one that mirrors nothing it is as the view itself is.
    ...quarters(270, BLUE, GREY, other, GREEN, [[332, 137], YELLOW]),
    [[80, 112], GREY],
    [[200, 187], GREY],
    [[10, 10], BLACK],
  ];
  const before = seen(RED, PINK);
  expect(await painted(page, before)).toEqual(before.map(([, colour]) => colour));
  // What is drawn with a view is drawn again when the view is.
  await page.evaluate(() => window.scene.step());
  const after = seen([0, 255, 255], [255, 255, 255]);
  expect(await painted(page, after)).toEqual(after.map(([, colour]) => colour));
});

// Qt 6.11 says nothing of the frames a second has until the second is over,
// and then some sixty for a cube that turns; the times of a frame it says
// from the first.
test("a View3D says how fast it draws", async ({ page }) => {
  await open(page, "stats3d");
  const read = () =>
    page.evaluate(() => {
      const told = ({ fps, frameTime, renderTime, maxFrameTime, syncTime, renderPrepareTime }) => ({ fps, frameTime, renderTime, maxFrameTime, syncTime, renderPrepareTime });
      const { turning, still, seen, fps } = window.scene;
      return { turning: told(turning), still: told(still), seen: [...seen], fps, same: turning === window.scene.turning, other: turning !== still };
    });
  const first = await read();
  expect(first).toMatchObject({ same: true, other: true, fps: 0, seen: [] });
  expect(first.turning).toMatchObject({ fps: 0, maxFrameTime: 0 });
  expect(await page.evaluate(() => {
    const { extendedDataCollectionEnabled, drawCallCount, renderPassCount, renderPassDetails, graphicsApiName, pipelineCount } = window.scene.turning;
    window.scene.turning.releaseCachedResources();
    return { extendedDataCollectionEnabled, drawCallCount, renderPassCount, renderPassDetails, graphicsApiName, pipelineCount };
  })).toEqual({ extendedDataCollectionEnabled: false, drawCallCount: 0, renderPassCount: 0, renderPassDetails: "", graphicsApiName: "OpenGL", pipelineCount: 0 });

  await expect.poll(async () => (await read()).fps, { timeout: 5000 }).toBeGreaterThan(0);
  const later = await read();
  expect(later.seen.at(-1)).toBe(later.fps);
  expect(later.turning.frameTime).toBeGreaterThan(0);
  expect(later.turning.renderTime).toBeGreaterThan(0);
  expect(later.turning.renderTime).toBeLessThanOrEqual(later.turning.frameTime);
  expect(later.turning.maxFrameTime).toBeGreaterThan(0);
  // The one drawn once has not had a second of frames.
  expect(later.still).toMatchObject({ fps: 0, maxFrameTime: 0 });
});

test("a CustomMaterial's max and min are as GLSL says they are, of what is no number too", async ({ page }) => {
  await open(page, "undefinedmax3d");
  await expect.poll(async () => (await pixels(page, [[50, 50]]))[0]).toBe("255 255 255");
});
