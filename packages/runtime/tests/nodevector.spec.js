import { expect, open, test } from "./open.js";

// What Qt 6.11 answers for the same scene.
const QT = [
  5,
  5,
  6,
  9,
  11,
  12,
  13,
  3,
  3,
  13,
  28,
  '{"x":15,"y":0,"z":0}',
  "QVector3D(15, 0, 0)",
  true,
  15,
  true,
  [
    [3.5, 0, 0],
    [1.03, 4.93, 3.35],
    [-2.9, 9.87, 1.96],
    [-2.73, 14.81, -2.2],
  ],
];

test("a node's vector is the node's in a program's hands, and a copy in a property", async ({ page }) => {
  await open(page, "nodevector");
  expect(await page.evaluate(() => window.scene.read())).toEqual(QT);
});
