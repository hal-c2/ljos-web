// `Ljos.Layout`'s Row, Column, Box and Grid size their children by ljos-ui's
// one rule (DIALECT.md §4.6): a child keeps its size along an axis it says
// nothing about through `Layout`, and asks for its `Layout.preferredWidth`,
// else the width its file gives it, else its implicit width, along one it
// does. Each case of `scenes/ljoslayoutrule.qml` is held to what ljos-ui
// does with the same file: `fixtures/ljoslayoutrule.json` is the file with
// `Align` and `Direction` for the numbers and a `TestCase` that logs
// `dump()` after 100 ms, after hiding `fFiller`, showing it again and
// turning `gBox`, run by `ljos test` (ljos-ui c2443e15).
//
// Each child is [x, y, width, height, implicitWidth, implicitHeight].
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, open, test } from "./open.js";

const ljos = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "ljoslayoutrule.json"), "utf8"));

const dump = (page) => page.evaluate(() => JSON.parse(window.scene.dump()));
const pick = (all, names) => Object.fromEntries(names.map((name) => [name, all[name]]));

const cases = [
  ["an explicit width is what a child of a Row asks for", ["aRow", "aA", "aB", "aC"]],
  ["a child of a Column keeps its explicit width, and its alignment moves it", ["bCol", "bT", "bF", "bCentred"]],
  ["a Row with spacing shares the room as a RowLayout does", ["cRow", "cA", "cB", "cC"]],
  ["room shared out is shared in whole pixels", ["dRow", "dA", "dB", "dC"]],
  ["children that only have sizes are packed as a positioner packs them", ["eRow", "eA", "eSkipped", "eB"]],
  ["a child that fills takes the room the others leave", ["fRow", "fFiller", "fFixed"]],
  ["a Box lays its children out down a column", ["gBox", "gDisplay", "gPad"]],
  ["a preferred width is asked for over an explicit one", ["hRow", "hP", "hQ"]],
  ["two that fill share the room by the widths their files give them", ["iRow", "iM", "iN"]],
  ["a maximum holds one that fills, and the room nobody takes is left at the end", ["jRow", "jU", "jV"]],
  ["a minimum is kept over a preferred width, and a maximum over a minimum", ["kRow", "kW", "kX"]],
  ["with less room than they ask for, those that fill give it up", ["lRow", "lA", "lB"]],
  ["across a Row a child fills, keeps its height, or is placed at the start unless aligned", ["mRow", "mFill", "mOwn", "mPref", "mCentre", "mBottom"]],
  ["an explicit height is what a child of a Column asks for", ["nCol", "nH1", "nH2"]],
  ["padding is around the children that fill", ["oRow", "oA", "oB"]],
  ["a Row right to left starts at the right, planned or packed", ["pRow", "pA", "pB", "pLine", "pC", "pD"]],
  ["a Grid of children that only have sizes is Qt's Grid positioner", ["qGrid", "qA", "qB", "qC", "qD", "qE"]],
  ["a Grid of two rows fills them column after column", ["rGrid", "rA", "rB", "rC"]],
  ["a Grid's child fills its column, and one spans both", ["sGrid", "sA", "sB", "sC"]],
  ["a Grid with no count is one line along its flow", ["tGrid", "tA", "tB", "tC"]],
  ["a Grid as the migration writes a GridLayout sizes its children as the GridLayout does", ["uGrid", "uA", "uB", "uC"]],
  ["an explicit width is what a child of a Grid asks for", ["vGrid", "vA", "vB"]],
  ["a child's margins are around it", ["wRow", "wA"]],
  ["a Row in a Column fills it", ["xCol", "xRow", "xFill", "xFixed"]],
  ["a child of a Column that says nothing of its width keeps it", ["yCol", "yA"]],
  ["two children of a Grid fill a row between them", ["zGrid", "zA", "zB"]],
];

for (const [title, names] of cases) {
  test(title, async ({ page }) => {
    await open(page, "ljoslayoutrule");
    expect(pick(await dump(page), names)).toEqual(pick(ljos.start, names));
  });
}

test("a child that fills, hidden and shown again, asks for its own size", async ({ page }) => {
  await open(page, "ljoslayoutrule");
  const names = ["fRow", "fFiller", "fFixed"];
  const toggle = (visible) =>
    page.evaluate((visible) => {
      window.scene.fFillerItem.visible = visible;
      window.flush();
    }, visible);
  await toggle(false);
  expect(pick(await dump(page), names)).toEqual(pick(ljos.hidden, names));
  await toggle(true);
  expect(pick(await dump(page), names)).toEqual(pick(ljos.shown, names));
});

test("a Box that turns lays the same children out the other way", async ({ page }) => {
  await open(page, "ljoslayoutrule");
  const names = ["gBox", "gDisplay", "gPad"];
  await page.evaluate(() => {
    window.scene.gBoxItem.wide = true;
    window.flush();
  });
  expect(pick(await dump(page), names)).toEqual(pick(ljos.turned, names));
});
