// What is expected here is what Qt 6.11 answers for the same QML: the scene
// is run by `qml6` too, and asked the same.
import { expect, open, test } from "./open.js";

test("QtQuick.Templates lays a control out, and hands down its font and colours, as Qt does", async ({
  page,
}) => {
  await open(page, "controls");
  expect(
    await page.evaluate(() =>
      JSON.parse(JSON.stringify(window.scene.answers())),
    ),
  ).toEqual([
    [6, 4, 10, 6],
    [10, 6, 186, 88],
    [4, 6, 186, 88, true],
    [3, 2, 192, 91, -1, true],
    [40, 24],
    [50, 30],
    [0, 0, 8],
    [15, 13, 15, 13, 3, 3, 9, 7],
    [0, 5, 20, 0, 2],
    [0, 0, 100, 50],
    [20, "Serif", false, 400, false],
    [20, "Serif", true, 700],
    [20, "Serif", false, true],
    [12, "Sans Serif"],
    [12, "Sans Serif", 400],
    [20, 15, 20, 15],
    [1, 0, 59, 28, -1, 11, 0],
    [true, true, 1, true],
    [70, 30, 70, 30],
    [94, 54, 94, 54],
    [12, 12, 70, 30],
    [0, 0, 94, 54, "#efefef"],
    [0, 0, 10, 10, 2],
    [true, true],
    [true, 10, 4, 4, 112, 72],
    [50, 25, 2],
    [0, 0, 200, 40, true],
    [0, 130, 200, 20, true],
    [2, 45, 196, 80],
    [0, 0, 196, 80],
    [90, 40, 60, 0],
    [90, "Page", 1, 0, 1],
    ["Box", 33, 12, true, 0, 0, 33, 12],
    ["Serif", 600, true, 12],
    ["Serif", 600, true, "Serif", 600, 30],
    [0, 0, 300, 30, 0, 175, 300, 25],
    [0, 30, 300, 145],
    [300, 145, true, false],
    [0, 0, 300, 200, -1],
    ["#112233", "#112233", "#112233"],
    ["#000000", "#445566", "#445566", "#000000"],
    ["#010203", "#010203", "#010203", "#efefef"],
    ["#bebebe", "#000000", "#000000"],
  ]);
});

// What the same window answers in Qt with each of its styles.
const COMMON = [
  ["#9a9b9b", "#bf0040", "#030406", "#ff0000"],
  ["#7f308cc6", "#7f308cc6", "#ff0000", "#00ff0000"],
  [true],
];
const OWN = [
  ["#efefef", "#efefef", "#efefef", "#000000"],
  ["#bebebe", "#000000", "#919191"],
  ["#010203", "#010203", "#000000"],
];
const STYLES = {
  Basic: [
    [12, 400, 12, 400],
    [21, 400, 21, 400, 21, 400, 21, 400],
    ["#e0e0e0", "#efefef", "#e0e0e0", "#353637"],
    ["#7f353637", "#353637", "#919191"],
    ["#010203", "#010203", "#26282a"],
  ],
  Fusion: [[12, 400, 12, 400], [21, 400, 21, 400, 21, 400, 21, 400], ...OWN],
  Material: [[14, 400, 14, 400], [21, 500, 21, 400, 21, 400, 21, 500], ...OWN],
  Universal: [[15, 400, 15, 400], [21, 400, 21, 600, 21, 400, 21, 300], ...OWN],
};

for (const [style, expected] of Object.entries(STYLES)) {
  test(`with the ${style} style, controls have its fonts and its colours`, async ({
    page,
  }) => {
    await open(page, `themes&style=${style}`);
    expect(await page.evaluate(() => window.objects.answers())).toEqual([
      ...expected,
      ...COMMON,
    ]);
  });
}

// ljos-ui's Basic style has a dark palette (ljos_quick palette.rs), and in
// a dark scheme its controls are drawn with it: a style whose colours were
// only light painted dark text on the dark page around it.
test("with the Basic style in a dark scheme, controls have its dark colours, and change as the scheme does", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await open(page, "themes&style=Basic");
  const colours = () =>
    page.evaluate(() => window.objects.answers().slice(2, 5));
  expect(await colours()).toEqual([
    ["#2f2f2f", "#2f2f2f", "#2f2f2f", "#eff0f2"],
    ["#7fc8c9cb", "#eff0f2", "#919191"],
    ["#010203", "#010203", "#d4d6d8"],
  ]);
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(colours).toEqual(STYLES.Basic.slice(2, 5));
});
