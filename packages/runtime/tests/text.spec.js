import { expect, open, test } from "./open.js";
import { pixels } from "./pixels.js";

const BLACK = "0 0 0";
const WHITE = "255 255 255";

// width, height, implicitWidth, implicitHeight, contentWidth, contentHeight,
// lineCount, truncated, baselineOffset and the pixel size of the font used.
const sizes = (page, names) =>
  page.evaluate(
    (names) =>
      Object.fromEntries(
        names.map((name) => {
          const text = window.objects[name];
          const {
            width,
            height,
            implicitWidth,
            implicitHeight,
            contentWidth,
            contentHeight,
            lineCount,
            truncated,
            baselineOffset,
          } = text;
          const all = [
            width,
            height,
            implicitWidth,
            implicitHeight,
            contentWidth,
            contentHeight,
            lineCount,
            truncated,
            baselineOffset,
          ];
          return [name, [...all, text.fontInfo.pixelSize]];
        }),
      ),
    names,
  );

// Where the text an item shows is, against the item: the lines themselves,
// not the element that holds them.
const inked = (page, name) =>
  page.evaluate((name) => {
    const text = window.objects[name];
    const range = document.createRange();
    range.selectNodeContents(text.$markup);
    const ink = range.getBoundingClientRect();
    const frame = text.$node.getBoundingClientRect();
    return { x: ink.x - frame.x, y: ink.y - frame.y, width: ink.width, height: ink.height, text: text.$markup.textContent };
  }, name);

// The scene has a font that cannot be loaded, which Qt tells of.
test.use({ told: [/^FontLoader: Cannot load font: "data:font\/ttf;base64,AAAA"$/] });

async function boxes(page, scene = "textboxes") {
  await open(page, scene);
  await page.waitForFunction(() => window.objects.boxes.status === 1 && (window.objects.bold?.status ?? 1) === 1);
}

// What `qml6` prints for the scene, which is in a font made for the purpose.
const QT = {
  label: [84, 16, 84, 16, 84, 16, 1, false, 13, 16],
  heavy: [105, 16, 105, 16, 105, 16, 1, false, 13, 16],
  wrapped: [80, 48, 168, 48, 76, 48, 3, false, 13, 16],
  broken: [80, 32, 120, 32, 80, 32, 2, false, 13, 16],
  elided: [80, 16, 128, 16, 76, 16, 1, true, 13, 16],
  limited: [80, 32, 168, 32, 76, 32, 2, true, 13, 16],
  lines: [32, 48, 32, 48, 32, 48, 2, false, 13, 16],
  literal: [32, 16, 32, 16, 32, 16, 1, false, 13, 16],
  centred: [200, 60, 84, 16, 84, 16, 1, false, 35, 16],
  cornered: [200, 60, 32, 32, 32, 32, 2, false, 41, 16],
  padded: [72, 36, 72, 36, 32, 16, 1, false, 23, 16],
  spaced: [51, 16, 51, 16, 51, 16, 1, false, 13, 16],
  upper: [36, 16, 36, 16, 36, 16, 1, false, 13, 16],
  fitted: [200, 24, 210, 40, 126, 24, 1, false, 19.5, 24],
  points: [32, 16, 32, 16, 32, 16, 1, false, 13, 16],
  follower: [42, 32, 84, 32, 40, 32, 2, false, 13, 16],
};

test("a font is loaded from a file, and a broken one is an error", async ({ page }) => {
  await boxes(page);
  await page.waitForFunction(() => window.objects.missing.status !== 2);
  const read = await page.evaluate(() => {
    const { boxes, bold, missing, unused } = window.objects;
    return [boxes, bold, missing, unused].map((loader) => [loader.status, loader.name]);
  });
  expect(read).toEqual([
    [1, "Qml Solid Test"],
    [1, "Qml Solid Test"],
    [3, ""],
    [0, ""],
  ]);
  expect(
    await page.evaluate(
      () => document.fonts.check('16px "Qml Solid Test"') && document.fonts.check('bold 16px "Qml Solid Test"'),
    ),
  ).toBe(true);
});

test("text is as wide, as tall and in as many lines as Qt makes it", async ({ page }) => {
  await boxes(page);
  expect(await sizes(page, Object.keys(QT))).toEqual(QT);
});

test("the lines are the ones Qt breaks the text into", async ({ page }) => {
  await boxes(page);
  const shown = (name) => page.evaluate((name) => window.objects[name].$markup.textContent, name);
  expect(await shown("wrapped")).toBe("one two\nthree four\nfive");
  expect(await shown("broken")).toBe("abcdefghij\nklmno");
  expect(await shown("elided")).toBe("Hello wor…");
  expect(await shown("limited")).toBe("one two\nthree four");
  expect(await shown("upper")).toBe("AB CD");
  expect(await shown("follower")).toBe("Hello\nworld");
});

test("what the page shows is as large as what was measured, and where the alignment puts it", async ({ page }) => {
  await boxes(page);
  expect(await inked(page, "label")).toEqual({ x: 0, y: 0, width: 84, height: 16, text: "Hello world" });
  expect(await inked(page, "heavy")).toMatchObject({ x: 0, y: 0, width: 105, height: 16 });
  expect(await inked(page, "wrapped")).toMatchObject({ x: 0, y: 0, width: 76, height: 48 });
  // A line and a half each: the half is below the text.
  expect(await inked(page, "lines")).toMatchObject({ x: 0, y: 0, width: 32, height: 40 });
  expect(await inked(page, "centred")).toMatchObject({ x: 58, y: 22, width: 84, height: 16 });
  expect(await inked(page, "cornered")).toMatchObject({ x: 168, y: 28, width: 32, height: 32 });
  expect(await inked(page, "padded")).toMatchObject({ x: 30, y: 10, width: 32, height: 16 });
  expect(await inked(page, "spaced")).toMatchObject({ width: 51 });
  expect(await inked(page, "fitted")).toMatchObject({ x: 0, width: 126 });
  // A glyph is a box from 1 to 7 of its 8 pixels, 11 tall on the baseline.
  expect(
    await pixels(page, [
      [0, 8],
      [4, 8],
      [7, 8],
      [12, 8],
      [42, 8],
      [4, 1],
      [4, 2],
      [4, 12],
      [4, 13],
      [5, 28],
      [10, 28],
    ]),
  ).toEqual([WHITE, BLACK, WHITE, BLACK, WHITE, WHITE, BLACK, BLACK, WHITE, BLACK, WHITE]);
});

// What `qml6` prints for the scene: implicitWidth, contentWidth,
// implicitHeight, contentHeight, lineCount, truncated, height and
// baselineOffset of each text, in the default font.
const QT_HANGING = (() => {
  const one = (implicitWidth, implicitHeight, contentHeight, lineCount) => [
    implicitWidth,
    implicitWidth,
    implicitHeight,
    contentHeight,
    lineCount,
    false,
    implicitHeight,
    14.484375,
  ];
  const aligned = [
    one(17.78125, 18, 18, 1),
    one(22.21875, 18, 18, 1),
    one(22.21875, 18, 18, 1),
    one(26.65625, 18, 18, 1),
    one(17.78125, 36, 36, 2),
    one(17.78125, 36, 18, 1),
    one(25.765625, 36, 36, 2),
    one(17.78125, 54, 36, 2),
    one(0, 36, 18, 1),
  ];
  const more = [
    [106.609375, 57.875, 54, 36, 2, false, 54, 14.484375],
    one(57.875, 36, 36, 2),
    one(17.78125, 18, 18, 1),
    one(17.78125, 36, 36, 2),
    [17.78125, 38.21875, 18, 18, 1, true, 18, 14.484375],
    [17.78125, 17.78125, 36, 18, 1, false, 40, 36.484375],
    one(17.78125, 36, 36, 2),
    one(22.21875, 36, 36, 2),
  ];
  return [aligned, aligned, more];
})();

test("a space before a line break hangs, and a line break that ends the text starts no line", async ({ page }) => {
  await open(page, "hanging");
  expect(await page.evaluate(() => JSON.parse(JSON.stringify(window.scene.answers())))).toEqual(QT_HANGING);
  // The lines of each text, and how far their right ends are from the right
  // edge of the item: a space that hangs is not there to be set.
  const lines = (column) =>
    page.evaluate((column) => {
      const texts = Array.from(window.scene.children[column].children).filter((text) => text.$markup);
      return texts.map((text) => {
        const range = document.createRange();
        range.selectNodeContents(text.$markup);
        const frame = text.$node.getBoundingClientRect();
        const ends = Array.from(range.getClientRects(), (line) => Math.round((frame.right - line.right) * 100) / 100);
        return [text.$markup.textContent, [...new Set(ends)]];
      });
    }, column);
  expect(await lines(0)).toEqual([
    ["ab", [0]],
    ["ab ", [0]],
    [" ab", [0]],
    ["ab  ", [0]],
    ["ab\ncd", [0]],
    ["ab", [0]],
    [" ab\n cd ", [0]],
    ["ab\n", [0]],
    ["", []],
  ]);
  expect((await lines(2)).map(([text]) => text)).toEqual([
    "ab cd ef\ngh ij kl",
    "ab cd ef\ngh ij kl",
    "ab",
    "ab\n",
    "ab …",
    "ab",
    "ab\ncd",
  ]);
});

// What Qt 6.11 answers for scenes/tabstops.qml: implicitWidth, contentWidth
// and lineCount of each text set from the left and from the right, of the
// wrapped one and the three cut to fit, then the widths of the two TextEdits.
const QT_TABS = [
  [86.671875, 86.671875, 1],
  [86.671875, 86.671875, 1],
  [80, 80, 1],
  [80, 80, 1],
  [80, 80, 1],
  [80, 80, 1],
  [166.671875, 166.671875, 1],
  [166.671875, 166.671875, 1],
  [160, 160, 2],
  [160, 161, 2],
  [166.671875, 166.671875, 1],
  [166.671875, 166.671875, 1],
  [86.671875, 86.671875, 2],
  [86.671875, 86.671875, 2],
  [220.625, 129.3125, 2],
  [220.625, 127.96875, 1],
  [220.625, 72.625, 1],
  [220.625, 119.984375, 1],
  [86.671875, 86.671875],
  [36.671875, 36.671875],
];

test("a tab goes on to the next stop of its line, 80 pixels apart", async ({ page }) => {
  await open(page, "tabstops");
  expect(await page.evaluate(() => JSON.parse(JSON.stringify(window.scene.answers())))).toEqual(QT_TABS);
  // Where what follows the last tab of each line is drawn, from the left of
  // the item: on a stop counted from where the line starts, wherever the
  // line is set in the item.
  const after = (column) =>
    page.evaluate((column) => {
      const texts = Array.from(window.scene.children[column].children).filter((text) => text.$markup);
      return texts.map((text) => {
        const letters = text.$markup.firstChild;
        const frame = text.$node.getBoundingClientRect();
        const range = document.createRange();
        return letters.data.split("\n").map((line, index, lines) => {
          const tab = line.lastIndexOf("\t");
          if (tab < 0 || tab === line.length - 1) return null;
          const at = lines.slice(0, index).join("\n").length + (index ? 1 : 0) + tab + 1;
          range.setStart(letters, at);
          range.setEnd(letters, at + 1);
          return Math.round(range.getBoundingClientRect().left - frame.left);
        });
      });
    }, column);
  expect(await after(0)).toEqual([[80], [null], [null], [160], [null, null], [160], [80, 80]]);
  expect(await after(1)).toEqual([[183], [null], [null], [183], [null, null], [183], [183, 183]]);
  expect(await page.evaluate(() => window.scene.children[3].$markup.textContent)).toBe("one\ttwo thr…");
});

test("a text is laid out again when what it depends on changes", async ({ page }) => {
  await boxes(page);
  const read = await page.evaluate(() => {
    const { label, wrapped, elided, limited, follower, padded } = window.objects;
    label.text = "ab cd ef";
    wrapped.width = 200;
    elided.elide = 2;
    limited.elide = 1;
    padded.font.pixelSize = 32;
    padded.font.bold = true;
    window.flush();
    return {
      label: [label.width, label.implicitWidth, label.$markup.textContent],
      wrapped: [wrapped.height, wrapped.lineCount, wrapped.contentWidth],
      elided: [elided.$markup.textContent, elided.contentWidth],
      limited: [limited.$markup.textContent, limited.truncated, limited.lineCount],
      follower: [follower.width, follower.height, follower.$markup.textContent],
      padded: [padded.width, padded.height, padded.font.weight, padded.baselineOffset, getComputedStyle(padded.$markup).font],
    };
  });
  expect(read).toEqual({
    label: [56, 56, "ab cd ef"],
    wrapped: [16, 1, 168],
    elided: ["Hell…gain", 72],
    limited: ["one two\nthree fou…", true, 2],
    follower: [28, 48, "ab\ncd\nef"],
    padded: [120, 52, 700, 36, '700 32px / 32px "Qml Solid Test", sans-serif'],
  });
});

test("TextMetrics and FontMetrics measure as Qt does", async ({ page }) => {
  await boxes(page);
  const read = await page.evaluate(() => {
    const { measure, face } = window.objects;
    const flat = ({ x, y, width, height }) => [x, y, width, height];
    return {
      measure: [
        measure.advanceWidth,
        measure.width,
        measure.height,
        flat(measure.boundingRect),
        flat(measure.tightBoundingRect),
        measure.elidedText,
      ],
      face: [
        face.ascent,
        face.descent,
        face.height,
        face.leading,
        face.lineSpacing,
        face.xHeight,
        face.capitalHeight,
        face.advanceWidth("ab cd"),
        flat(face.boundingRect("ab")),
        flat(face.tightBoundingRect("ab")),
        face.elidedText("abcdefgh", 1, 40),
      ],
    };
  });
  expect(read).toEqual({
    measure: [84, 82, 16, [1, -13, 82, 16], [1, -11, 82, 11], "…rld"],
    face: [13, 3, 16, 0, 16, 8, 11, 36, [1, -13, 14, 16], [1, -11, 14, 11], "abc…"],
  });
  const changed = await page.evaluate(() => {
    const { measure } = window.objects;
    measure.text = "ab";
    measure.font.bold = true;
    return [measure.advanceWidth, measure.width, measure.elidedText];
  });
  expect(changed).toEqual([20, 18, "ab"]);
});

// What `qml6` prints for `scenes/text.js`: implicitWidth, implicitHeight,
// contentWidth, contentHeight, lineCount, truncated, baselineOffset and the
// pixel size of the font used.
const QT_TEXT = {
  plain: [65.046875, 14, 65.046875, 14, 1, false, 10.859375, 12],
  large: [130.1875, 27, 130.1875, 27, 1, false, 21.71875, 24],
  points: [86.765625, 18, 86.765625, 18, 1, false, 14.484375, 16],
  bold: [69.703125, 14, 69.703125, 14, 1, false, 10.859375, 12],
  italic: [65.265625, 14, 65.265625, 14, 1, false, 10.859375, 12],
  empty: [0, 14, 0, 14, 1, false, 10.859375, 12],
  heavy: [232.515625, 45, 232.515625, 45, 1, false, 36.203125, 40],
  mono: [144, 23, 144, 23, 1, false, 16.640625, 20],
  kerned: [73.984375, 14, 73.984375, 14, 1, false, 10.859375, 12],
  hanging: [13.65625, 14, 13.65625, 14, 1, false, 10.859375, 12],
  wrap: [237.28125, 42, 97.96875, 42, 3, false, 10.859375, 12],
  elideR: [237.28125, 14, 99.984375, 14, 1, true, 10.859375, 12],
  elideL: [237.28125, 14, 96.65625, 14, 1, true, 10.859375, 12],
  elideM: [237.28125, 14, 94.015625, 14, 1, true, 10.859375, 12],
  max2e: [237.28125, 28, 96.625, 28, 2, true, 10.859375, 12],
  max2: [237.28125, 28, 97.96875, 28, 2, true, 10.859375, 12],
  h30e: [237.28125, 42, 97.96875, 28, 2, true, 10.859375, 12],
  h30: [237.28125, 42, 97.96875, 42, 3, false, 10.859375, 12],
  nowidth: [237.28125, 14, 237.28125, 14, 1, false, 10.859375, 12],
  lh: [237.28125, 63, 97.96875, 63, 3, false, 10.859375, 12],
  lhf: [237.28125, 60, 97.96875, 60, 3, false, 10.859375, 12],
  two: [42, 28, 42, 28, 2, false, 10.859375, 12],
  pad: [85.046875, 34, 65.046875, 14, 1, false, 20.859375, 12],
  padfox: [257.28125, 76, 79.640625, 56, 4, false, 44.859375, 12],
  centre: [65.046875, 14, 65.046875, 14, 1, false, 53.859375, 12],
  spaced: [94.046875, 14, 94.046875, 14, 1, false, 10.859375, 12],
  upper: [90.609375, 14, 90.609375, 14, 1, false, 10.859375, 12],
  longW: [201.234375, 28, 171.921875, 28, 2, false, 10.859375, 12],
  longWrap: [201.234375, 42, 96.59375, 42, 3, false, 10.859375, 12],
  longAny: [201.234375, 42, 97.96875, 42, 3, false, 10.859375, 12],
  hyphen: [273.9375, 84, 59.96875, 84, 6, false, 10.859375, 12],
  spaces: [103.578125, 56, 25.984375, 56, 4, false, 10.859375, 12],
  plainfmt: [146.359375, 14, 146.359375, 14, 1, false, 10.859375, 12],
  fit: [260.453125, 54, 97.578125, 21, 1, false, 16.28125, 18],
  hfit: [949.546875, 486, 94.953125, 18, 2, false, 7.234375, 8],
  fitwrap: [949.546875, 486, 95.265625, 45, 3, false, 11.765625, 13],
  vfit: [109.34375, 54, 38.703125, 19, 1, false, 15.375, 17],
};

// Markup is the browser's to set, and the browser kerns less than Qt: no
// letter against a space, and Liberation Serif otherwise. These are Qt's
// sizes to within half a pixel, not to the last bit.
const QT_NEAR = {
  apart: [80.421875, 14, 80.421875, 14, 1, false, 10.859375, 12],
  serif: [103.53125, 23, 103.53125, 23, 1, false, 17.8125, 20],
  auto: [67.265625, 14, 67.265625, 14, 1, false, 10.859375, 12],
  br: [31.078125, 28, 31.078125, 28, 2, false, 10.859375, 12],
  head: [58.671875, 41, 58.671875, 41, 2, false, 21.71875, 12],
  fontsize: [75.359375, 21, 75.359375, 21, 1, false, 16.28125, 12],
  rich: [58.640625, 53, 58.640625, 53, 1, false, 21.71875, 12],
};

// advanceWidth, width, height, boundingRect, tightBoundingRect, elidedText.
const QT_METRICS = {
  measure: [65.046875, 65, 13.390625, [0, -10.859375, 65, 13.390625], [0, -9, 65, 11], "Hello…"],
  big: [91.09375, 87, 44.671875, [3, -36.203125, 87, 44.671875], [3, -30, 87, 30], "Hello"],
  tail: [68.859375, 70, 44.671875, [-1, -36.203125, 70, 44.671875], [-1, -30, 70, 38], "jelly"],
};

// implicitWidth, implicitHeight, contentWidth, contentHeight, baselineOffset,
// lineCount (a TextInput has none) and length.
const QT_EDITS = {
  input: [66, 14, 65.046875, 14, 10.859375, null, 12],
  inputEmpty: [0, 14, 0, 14, 10.859375, null, 0],
  inputPadded: [38, 24, 27.3125, 14, 15.859375, null, 5],
  inputBoxed: [28, 14, 27.3125, 14, 23.859375, null, 5],
  inputUpper: [40, 14, 39.328125, 14, 10.859375, null, 5],
  inputHanging: [14, 14, 13.65625, 14, 10.859375, null, 3],
  edit: [42, 28, 42, 28, 10.859375, 2, 17],
  editHanging: [13.65625, 14, 13.65625, 14, 10.859375, 1, 3],
  editFox: [237.28125, 42, 97.96875, 42, 10.859375, 3, 43],
  editLow: [37.3125, 24, 27.3125, 14, 51.859375, 1, 5],
  editEnd: [19.34375, 28, 19.34375, 28, 10.859375, 2, 4],
};

// Qt's numbers are of the Liberation fonts: they say nothing about a machine
// whose browser sets `sans-serif` in something else.
async function liberation(page) {
  await open(page, "text");
  const [sans, mono] = await page.evaluate(() => {
    const canvas = document.createElement("canvas").getContext("2d");
    return ["12px sans-serif", '20px "Liberation Mono"'].map((font) => {
      canvas.font = font;
      return canvas.measureText("Hello, World").width;
    });
  });
  test.skip(Math.abs(sans - 65.13) > 0.01 || Math.abs(mono - 144.02) > 0.01, "the fonts Qt measured are not the browser's");
}

const implicit = (page, names) =>
  page.evaluate(
    (names) =>
      Object.fromEntries(
        names.map((name) => {
          const text = window.objects[name];
          const { implicitWidth, implicitHeight, contentWidth, contentHeight, lineCount, truncated, baselineOffset } = text;
          return [
            name,
            [
              implicitWidth,
              implicitHeight,
              contentWidth,
              contentHeight,
              lineCount,
              truncated,
              baselineOffset,
              text.fontInfo.pixelSize,
            ],
          ];
        }),
      ),
    names,
  );

test("plain text in the default font measures exactly what it does in Qt", async ({ page }) => {
  await liberation(page);
  expect(await implicit(page, Object.keys(QT_TEXT))).toEqual(QT_TEXT);
});

test("markup, and kerning against a space, measure what they do in Qt to within half a pixel", async ({ page }) => {
  await liberation(page);
  const read = await implicit(page, Object.keys(QT_NEAR));
  for (const [name, qt] of Object.entries(QT_NEAR)) {
    const [implicitWidth, implicitHeight, contentWidth, contentHeight, ...rest] = read[name];
    expect(Math.abs(implicitWidth - qt[0]), name).toBeLessThan(0.5);
    expect(Math.abs(contentWidth - qt[2]), name).toBeLessThan(0.5);
    expect([implicitHeight, contentHeight, ...rest], name).toEqual([qt[1], qt[3], ...qt.slice(4)]);
  }
});

test("metrics in the default font are Qt's", async ({ page }) => {
  await liberation(page);
  const read = await page.evaluate((names) => {
    const flat = ({ x, y, width, height }) => [x, y, width, height];
    const { face } = window.objects;
    const metrics = Object.fromEntries(
      names.map((name) => {
        const { advanceWidth, width, height, boundingRect, tightBoundingRect, elidedText } = window.objects[name];
        return [name, [advanceWidth, width, height, flat(boundingRect), flat(tightBoundingRect), elidedText]];
      }),
    );
    const { ascent, descent, height, leading, lineSpacing, xHeight, capitalHeight } = face;
    const font = [ascent, descent, height, leading, lineSpacing, xHeight, capitalHeight];
    const strings = [face.advanceWidth("Hello"), flat(face.boundingRect("Hello")), flat(face.tightBoundingRect("Hello"))];
    return { metrics, face: [...font, ...strings, face.elidedText("Hello, World", 2, 40)] };
  }, Object.keys(QT_METRICS));
  expect(read.metrics).toEqual(QT_METRICS);
  expect(read.face).toEqual([
    10.859375,
    2.53125,
    13.390625,
    0,
    13.390625,
    6.34375,
    8.25,
    27.3125,
    [0, -10.859375, 28, 13.390625],
    [0, -9, 28, 9],
    "He…ld",
  ]);
});

test("a TextInput and a TextEdit in the default font are as large as Qt's", async ({ page }) => {
  await liberation(page);
  const read = await page.evaluate(
    (names) =>
      Object.fromEntries(
        names.map((name) => {
          const { implicitWidth, implicitHeight, contentWidth, contentHeight, baselineOffset, lineCount, length } =
            window.objects[name];
          return [name, [implicitWidth, implicitHeight, contentWidth, contentHeight, baselineOffset, lineCount ?? null, length]];
        }),
      ),
    Object.keys(QT_EDITS),
  );
  expect(read).toEqual(QT_EDITS);
});

// What `qml6` prints for `scenes/markup.js`, as for `scenes/textboxes.js`.
const QT_MARKUP = {
  styled: [60, 16, 60, 16, 60, 16, 1, false, 13, 16],
  coloured: [16, 16, 16, 16, 16, 16, 1, false, 13, 16],
  outlined: [16, 16, 16, 16, 16, 16, 1, false, 13, 16],
  raised: [16, 16, 16, 16, 16, 16, 1, false, 13, 16],
  sunken: [16, 16, 16, 16, 16, 16, 1, false, 13, 16],
  linked: [116, 16, 116, 16, 116, 16, 1, false, 13, 16],
  lined: [32, 32, 32, 32, 32, 32, 2, false, 13, 16],
  sized: [40, 24, 40, 24, 40, 24, 1, false, 19.5, 16],
  wrapped: [80, 48, 181, 48, 76, 48, 3, false, 13, 16],
  plain: [72, 16, 72, 16, 72, 16, 1, false, 13, 16],
  struck: [16, 16, 16, 16, 16, 16, 1, false, 13, 16],
  justified: [80, 48, 168, 48, 80, 48, 3, false, 13, 16],
  // Qt leaves the font of rich text out of `fontInfo`: the rest is compared.
  rich: [32, 44, 32, 44, 32, 44, 1, false, 13, 16],
};

test("markup is as large as Qt makes it, and made of the elements it names", async ({ page }) => {
  await boxes(page, "markup");
  expect(await sizes(page, Object.keys(QT_MARKUP))).toEqual(QT_MARKUP);
  const html = (name) => page.evaluate((name) => window.objects[name].$markup.innerHTML, name);
  expect(await html("styled")).toBe("ab <b>cd</b> <u>ef</u>");
  expect(await html("lined")).toBe("ab<br>cdef");
  expect(await html("rich")).toBe("<p>ab</p><p>cdef</p>");
  expect(await html("plain")).toBe("&lt;b&gt;ab&lt;/b&gt;");
  expect(await html("linked")).toBe('go <a data-link="there" href="there">there</a> or <a data-link="https://example.org/" href="https://example.org/">away</a>');
});

test("a text is painted in its colour, with its style around it, under it or over it", async ({ page }) => {
  await boxes(page, "markup");
  const RED = "255 0 0";
  expect(
    await pixels(page, [
      // coloured
      [4, 28],
      // outlined: white letters, a red line on each side of them
      [4, 48],
      [0, 48],
      [7, 48],
      [4, 41],
      [4, 53],
      [0, 41],
      // raised: the style colour shows below the letters
      [4, 68],
      [4, 73],
      [4, 61],
      // sunken: above them
      [4, 88],
      [4, 81],
      [4, 93],
      // a link in `linkColor`, beside text that is not one
      [4, 108],
      [24, 108],
      // `<font color size>`
      [6, 172],
    ]),
  ).toEqual([RED, WHITE, RED, RED, RED, RED, WHITE, BLACK, RED, WHITE, BLACK, RED, WHITE, BLACK, "0 128 0", "0 0 255"]);
  const lines = await page.evaluate(() => {
    const { struck, linked } = window.objects;
    return [
      getComputedStyle(struck.$markup).textDecorationLine,
      getComputedStyle(linked.$markup.querySelector("a")).textDecorationLine,
    ];
  });
  expect(lines).toEqual(["underline line-through", "underline"]);
});

test("a link is activated by a click and reported while the pointer is over it", async ({ page }) => {
  await boxes(page, "markup");
  const read = () =>
    page.evaluate(() => {
      const { linked, log } = window.objects;
      return { hovered: linked.hoveredLink, log: log.slice() };
    });
  expect(await page.evaluate(() => [4, 30, 100].map((x) => window.objects.linked.linkAt(x, 8)))).toEqual([
    "",
    "there",
    "https://example.org/",
  ]);
  await page.mouse.move(30, 108);
  expect(await read()).toEqual({ hovered: "there", log: ["hovered there"] });
  await page.mouse.click(30, 108);
  await page.mouse.move(4, 108);
  expect(await read()).toEqual({ hovered: "", log: ["hovered there", "activated there", "hovered "] });
  // The page stays where it is: a link is for `linkActivated` to follow.
  const before = page.url();
  await page.mouse.click(100, 108);
  expect((await read()).log.slice(-2)).toEqual(["hovered https://example.org/", "activated https://example.org/"]);
  expect(page.url()).toBe(before);
});

// As in Qt, a text takes a press that lands on one of its links: what
// stands under it (a MouseArea, a Flickable) does not take it from the link.
test("a link over a MouseArea is the link's to follow, and beside it the area's", async ({ page }) => {
  await boxes(page, "markup");
  const log = () => page.evaluate(() => window.objects.log.filter((line) => !line.startsWith("hovered")));
  // "ab in": the link is the 4th and 5th letters, 8 pixels each.
  await page.mouse.click(200 + 28, 248);
  expect(await log()).toEqual(["activated inside"]);
  await page.mouse.click(200 + 4, 248);
  expect(await log()).toEqual(["activated inside", "area clicked"]);
});

test("markup cannot run a script or bring a frame into the page", async ({ page }) => {
  await boxes(page, "markup");
  await page.mouse.click(204, 68);
  const read = await page.evaluate(() => {
    const { unsafe } = window.objects;
    unsafe.text =
      '<img src="data:image/png;base64,AAAA" onerror="window.hacked = 3"><a href="javascript:window.hacked = 4">ab</a>';
    window.flush();
    const first = unsafe.$markup.innerHTML;
    unsafe.$markup.querySelector("a").click();
    unsafe.text = '<b onclick="window.hacked = 1">ab</b><script>window.hacked = 2</script><iframe src="about:blank"></iframe>cd';
    window.flush();
    return [
      first,
      unsafe.$markup.innerHTML,
      window.hacked,
      document.querySelectorAll("script:not([type=module]), iframe").length,
    ];
  });
  expect(read).toEqual([
    '<img src="data:image/png;base64,AAAA"><a data-link="javascript:window.hacked = 4">ab</a>',
    "<b>ab</b>cd",
    undefined,
    0,
  ]);
});

// A link to a page carries its `href`, for a crawler and a new tab;
// one whose scheme could run a script, however it is hidden, does not.
test("a link to a page is followable, and a script's is not", async ({ page }) => {
  await boxes(page, "markup");
  const hrefs = await page.evaluate(() => {
    const { linked } = window.objects;
    linked.text = '<a href="/docs/">a</a><a href="#top">b</a><a href="mailto:x@example.org">c</a><a href="java&#9;script:x">d</a><a href=" JAVASCRIPT:x">e</a><a href="data:text/html,x">f</a><a href="vbscript:x">g</a>';
    window.flush();
    return [...linked.$markup.querySelectorAll("a")].map((a) => [a.dataset.link, a.getAttribute("href")]);
  });
  expect(hrefs).toEqual([
    ["/docs/", "/docs/"],
    ["#top", "#top"],
    ["mailto:x@example.org", "mailto:x@example.org"],
    ["java\tscript:x", null],
    [" JAVASCRIPT:x", null],
    ["data:text/html,x", null],
    ["vbscript:x", null],
  ]);
});

test("a text changes between plain and markup, and is justified or set from the right", async ({ page }) => {
  await boxes(page, "markup");
  const read = await page.evaluate(() => {
    const { styled, plain, justified, arabic } = window.objects;
    const ink = (element, text) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const box = range.getBoundingClientRect();
      const frame = text.$node.getBoundingClientRect();
      return [box.left - frame.left, box.right - frame.left];
    };
    const rows = [...justified.$markup.children].map((row) => [row.textContent, ...ink(row, justified)]);
    const right = [arabic.horizontalAlignment, arabic.effectiveHorizontalAlignment, ink(arabic.$markup, arabic)[1]];
    plain.textFormat = 4;
    styled.text = "abcd";
    arabic.horizontalAlignment = 1;
    window.flush();
    return {
      rows,
      right,
      plain: [plain.implicitWidth, plain.$markup.innerHTML],
      styled: [styled.implicitWidth, styled.$markup.innerHTML, styled.$markup.className],
      left: [arabic.effectiveHorizontalAlignment, ink(arabic.$markup, arabic)[0]],
    };
  });
  expect(read).toEqual({
    // Every line but the last reaches both edges.
    rows: [
      ["one two", 0, 80],
      ["three four", 0, 80],
      ["five", 0, 32],
    ],
    right: [2, 2, 100],
    plain: [20, "<b>ab</b>"],
    styled: [32, "abcd", "qq-text"],
    left: [1, 0],
  });
});
