// TextField and TextArea. What is expected is what Qt 6.11 answers for the
// same scenes (`qml6`), and what it notes when a QtTest `TestCase` makes the
// same moves with its mouse and keys.
import { advance, still as base, take } from "./notes.js";
import { expect, open, test } from "./open.js";
import { lettered, stages } from "./stages.js";

// prettier-ignore
const TEXTFIELD = [
  [[200,40,200,40,24,16],[200,40,0,0,0,0],[0,0,200,40,-1,true],["hint","#80ff0000",3],[false,false,7,true,false],[0,0,0,0,true,0],["","#000000",false,true,7,false],[20,true,true,700,false],[3,4,112,20,-1,30,12],[0,0],[0,5,20,0,2],[12,400,false,"#000000"],[]],
  [[200,40,120,40,0,16],[200,40,0,0,0,0],[0,0,120,40,-1,true],["hint","#80ff0000",0],[false,false,7,true,false],[0,0,0,0,true,0],["","#000000",false,true,7,false],[20,true,true,700,false],[3,4,112,20,-1,30,12],[0,0],[0,5,20,0,2],[12,400,false,"#000000"],[]],
  [[203,42,120,42,0,16],[200,40,2,3,0,0],[3,2,117,40,-1,true],["hint","#80ff0000",0],[false,false,7,true,false],[0,0,0,0,true,0],["","#000000",false,true,7,false],[20,true,true,700,false],[3,4,112,20,-1,30,12],[0,0],[1,5,149,0,2],[12,400,false,"#000000"],[]],
  [[203,42,120,42,0,16],[200,40,2,3,0,0],[3,2,117,40,-1,true],["hint","#80ff0000",0],[false,false,7,true,false],[0,0,0,0,true,0],["","#000000",false,true,7,false],[11,true,true,700,false],[3,4,112,20,-1,30,12],[0,0],[1,5,149,0,2],[12,400,false,"#000000"],[]],
  [[203,42,120,42,0,16],[200,40,2,3,0,0],[3,2,117,40,-1,true],["other","#0000ff",0],[false,false,7,true,false],[0,0,0,0,true,0],["","#000000",false,true,7,false],[11,true,true,700,false],[3,4,112,20,-1,30,12],[0,0],[1,5,149,0,2],[12,400,false,"#000000"],[]],
  [[203,42,120,42,0,16],[200,40,2,3,0,0],[3,2,117,40,-1,true],["other","#0000ff",0],[false,false,1,true,false],[0,0,0,0,true,0],["","#000000",false,true,7,false],[11,true,true,700,false],[3,4,112,20,-1,30,12],[0,0],[1,5,149,0,2],[12,400,false,"#000000"],["reason 1"]],
  [[203,42,120,42,0,16],[200,40,2,3,0,0],[3,2,117,40,-1,true],["other","#0000ff",0],[false,false,7,true,true],[0,0,0,0,true,0],["","#000000",false,true,7,false],[11,true,true,700,false],[3,4,112,20,-1,30,12],[0,0],[1,5,149,0,2],[12,400,false,"#000000"],["reason 7"]],
  [[203,42,120,42,0,16],[200,40,2,3,0,0],[3,2,117,40,-1,true],["other","#0000ff",0],[false,false,0,true,false],[0,0,0,0,true,0],["","#000000",false,true,0,true],[11,true,true,700,false],[3,4,112,20,-1,30,12],[0,0],[1,5,149,0,2],[12,400,false,"#000000"],["reason 0"]],
];

test("a TextField is as big as its style says, behind it a background, and says why it has focus", async ({ page }) => {
  await open(page, "textfield");
  await stages(page, TEXTFIELD);
});

// Where the fields are in their scenes.
// With time standing still, and the font the scene is measured in.
async function still(page, scene) {
  await base(page, scene);
  await lettered(page);
}

const at = { field: [10, 10], area: [10, 10], flick: [10, 100] };
const move = (page, name, x, y) => page.mouse.move(at[name][0] + x, at[name][1] + y);

async function press(page, name, x, y, button = "left") {
  await move(page, name, x, y);
  await page.mouse.down({ button });
}

// Time enough after a release for the next press not to be the second of a
// double click: what QtTest does as well.
async function release(page, button = "left") {
  await page.mouse.up({ button });
  await advance(page, 500);
}

const state = (page, ...names) =>
  page.evaluate((names) => names.map((name) => name.split(".").reduce((from, part) => from[part], window.scene)), names);

// Qt holds a press back from the text until it knows it is not a long one,
// so its field has focus when it is let go; the page's has it when pressed.
test("a TextField says when it is pressed, held and let go, and where", async ({ page }) => {
  await still(page, "textfield");
  await press(page, "field", 20, 15);
  expect(await take(page)).toEqual(["pressed 20,15 1 1 false", "reason 0"]);
  await release(page);
  expect(await take(page)).toEqual(["released 20,15 1 0 false"]);
  expect(await state(page, "field.activeFocus", "field.focusReason")).toEqual([true, 0]);

  await press(page, "field", 30, 12);
  expect(await take(page)).toEqual(["pressed 30,12 1 1 false"]);
  await advance(page, 1000);
  expect(await take(page)).toEqual(["held 30,12 1 1 true"]);
  await release(page);
  expect(await take(page)).toEqual(["released 30,12 1 0 false"]);

  // A press that goes along the text is not a long one.
  await press(page, "field", 30, 12);
  await move(page, "field", 60, 12);
  await advance(page, 1000);
  expect(await take(page)).toEqual(["pressed 30,12 1 1 false"]);
  await release(page);
  expect(await take(page)).toEqual(["released 30,12 1 0 false"]);

  // Nor is one of another button.
  await press(page, "field", 30, 12, "right");
  await advance(page, 1000);
  expect(await take(page)).toEqual(["pressed 30,12 2 2 false"]);
  await release(page, "right");
  expect(await take(page)).toEqual(["released 30,12 2 0 false"]);

  // Beside the text, on the padding, it is the field's all the same.
  await page.evaluate(() => window.scene.bare.forceActiveFocus());
  expect(await take(page)).toEqual(["reason 7"]);
  await press(page, "field", 4, 4);
  expect(await take(page)).toEqual(["pressed 4,4 1 1 false", "reason 0"]);
  await release(page);
  expect(await take(page)).toEqual(["released 4,4 1 0 false"]);
  expect(await state(page, "field.activeFocus", "field.focusReason")).toEqual([true, 0]);
  expect(await page.evaluate(() => document.activeElement === window.scene.field.$input)).toBe(true);
});

test("a TextField hovers where it is asked to, and Tab says why focus came and went", async ({ page }) => {
  await still(page, "textfield");
  await page.evaluate(() => window.scene.field.forceActiveFocus(0));
  await page.mouse.move(300, 250);
  await page.evaluate(() => {
    window.scene.field.hoverEnabled = true;
    window.scene.take();
  });
  await move(page, "field", 20, 20);
  expect(await take(page)).toEqual(["hovered true"]);
  await move(page, "field", 4, 4);
  expect(await take(page)).toEqual([]);
  await page.mouse.move(300, 250);
  expect(await take(page)).toEqual(["hovered false"]);
  await move(page, "field", 20, 20);
  expect(await take(page)).toEqual(["hovered true"]);
  // It is over the field until it moves.
  await page.evaluate(() => (window.scene.field.hoverEnabled = false));
  expect(await state(page, "field.hoverEnabled", "field.hovered")).toEqual([false, true]);
  await move(page, "field", 23, 20);
  expect(await take(page)).toEqual(["hovered false"]);

  await page.keyboard.press("Tab");
  expect(await take(page)).toEqual(["reason 1"]);
  expect(await state(page, "field.activeFocus", "bare.activeFocus", "bare.focusReason", "field.focusReason")).toEqual([false, true, 1, 1]);
  await page.keyboard.press("Shift+Tab");
  expect(await take(page)).toEqual(["reason 2"]);
  expect(await state(page, "field.activeFocus", "field.focusReason", "bare.focusReason")).toEqual([true, 2, 2]);
});

// prettier-ignore
const TEXTAREA = [
  [[60,44,60,44,40,32,2],[60,20,0,0,60,44,-1,true],["hint","#80ff0000",false,false,7,true,false],[0,14,0,14,16,32,true],["","#000000","#000000",false,true,7],[true,0,0,120,104,48,104],[48,104,0,0,4,4],[true,0,1,120,59,-1],[true,0,0,154,64,154,64],[154,64,0,0,154,64],[]],
  [[63,28,63,28,0,16,1],[60,20,3,2,60,26,-1,true],["hint","#80ff0000",false,false,7,true,false],[0,14,0,14,16,32,true],["","#000000","#000000",false,true,7],[true,0,0,120,104,48,104],[48,104,0,0,4,4],[true,0,1,120,59,-1],[true,0,0,154,64,154,64],[154,64,0,0,154,64],[]],
  [[84,44,100,44,68,32,2],[60,20,3,2,97,42,-1,true],["hint","#80ff0000",false,false,7,true,false],[0,14,0,14,16,32,true],["","#000000","#000000",false,true,7],[true,0,0,120,104,48,104],[48,104,0,0,4,4],[true,0,1,120,59,-1],[true,0,0,154,64,154,64],[154,64,0,0,154,64],[]],
  [[84,44,100,44,68,32,2],[60,20,3,2,97,42,-1,true],["hint","#80ff0000",false,false,7,true,false],[0,14,0,14,16,32,true],["","#000000","#000000",false,true,7],[true,0,0,120,104,48,104],[48,104,0,44,28,84],[true,0,1,120,59,-1],[true,0,0,154,64,154,64],[154,64,55,0,154,64],[]],
  [[84,44,100,44,68,32,2],[60,20,3,2,97,42,-1,true],["hint","#80ff0000",false,false,7,true,false],[0,14,0,14,16,32,true],["","#000000","#000000",false,true,7],[true,0,0,120,104,48,104],[48,104,0,16,12,20],[true,0,1,120,59,-1],[true,0,0,154,64,154,64],[154,64,8,14,154,64],[]],
  [[84,44,100,44,68,32,2],[60,20,3,2,97,42,-1,true],["hint","#80ff0000",false,false,7,true,false],[0,14,0,14,16,32,true],["","#000000","#000000",false,true,7],[true,0,0,264,60,264,40],[264,40,0,0,4,4],[true,0,1,120,59,-1],[true,0,0,154,64,154,64],[154,64,8,14,154,64],[]],
  [[84,44,100,44,68,32,2],[60,20,3,2,97,42,-1,true],["hint","#80ff0000",false,false,7,true,false],[0,14,0,14,16,32,true],["","#000000","#000000",false,true,7],[true,0,0,264,60,264,40],[264,40,0,0,4,4],[true,0,1,120,59,-1],[true,0,0,154,64,154,64],[154,64,8,14,154,64],[]],
  [[84,44,100,44,68,32,2],[60,20,3,2,97,42,-1,true],["hint","#80ff0000",false,false,7,true,false],[0,14,0,14,16,32,true],["","#000000","#000000",false,true,7],[true,0,0,200,150,168,56],[168,56,0,0,4,4],[true,0,1,200,149,-1],[true,0,0,154,120,154,64],[154,64,0,0,154,64],[]],
  [[84,44,100,44,68,32,2],[60,20,3,2,97,42,-1,true],["hint","#80ff0000",false,false,1,true,true],[0,14,0,14,16,32,true],["","#000000","#000000",false,true,7],[true,0,0,200,150,168,56],[168,56,0,0,4,4],[true,0,1,200,149,-1],[true,0,0,154,120,154,64],[154,64,0,0,154,64],["reason 1"]],
];

test("a TextArea is as big as its style says, and a Flickable it is attached to scrolls it", async ({ page }) => {
  await open(page, "textarea");
  await stages(page, TEXTAREA);
});

test("a TextArea says when it is pressed, held and let go, and hovers", async ({ page }) => {
  await still(page, "textarea");
  await press(page, "area", 20, 15);
  expect(await take(page)).toEqual(["pressed 20,15 1 1 false", "reason 0"]);
  await release(page);
  expect(await take(page)).toEqual(["released 20,15 1 0 false"]);
  expect(await state(page, "area.activeFocus", "area.focusReason", "area.cursorPosition")).toEqual([true, 0, 1]);

  await press(page, "area", 30, 12);
  expect(await take(page)).toEqual(["pressed 30,12 1 1 false"]);
  await advance(page, 1000);
  expect(await take(page)).toEqual(["held 30,12 1 1 true"]);
  await release(page);
  expect(await take(page)).toEqual(["released 30,12 1 0 false"]);

  // Beside the text, on the padding.
  await press(page, "area", 4, 40);
  expect(await take(page)).toEqual(["pressed 4,40 1 1 false"]);
  await release(page);
  expect(await take(page)).toEqual(["released 4,40 1 0 false"]);
  expect(await state(page, "area.activeFocus", "area.focusReason")).toEqual([true, 0]);

  await page.evaluate(() => (window.scene.area.hoverEnabled = true));
  await move(page, "area", 20, 20);
  expect(await take(page)).toEqual(["hovered true"]);
  await page.mouse.move(300, 250);
  expect(await take(page)).toEqual(["hovered false"]);
});

test("the Flickable a TextArea is attached to goes where the cursor does", async ({ page }) => {
  await open(page, "textarea");
  await lettered(page);
  const where = () => state(page, "flicked.cursorPosition", "flick.contentX", "flick.contentY");
  await press(page, "flick", 22, 10);
  await page.mouse.up();
  expect(await state(page, "flicked.activeFocus")).toEqual([true]);
  expect(await where()).toEqual([2, 0, 0]);
  for (let count = 0; count < 3; count++) await page.keyboard.press("ArrowDown");
  await expect.poll(where).toEqual([16, 0, 12]);
  for (let count = 0; count < 2; count++) await page.keyboard.press("ArrowDown");
  await expect.poll(where).toEqual([26, 0, 44]);
  // A line more, and there is more to scroll over.
  await page.keyboard.press("Enter");
  await page.keyboard.press("x");
  await expect.poll(where).toEqual([28, 0, 60]);
  expect(await state(page, "flick.contentHeight", "flicked.height", "flicked.lineCount")).toEqual([120, 120, 7]);
  await page.keyboard.press("Control+Home");
  await expect.poll(where).toEqual([0, 0, 0]);
});

// A style lays its placeholder, a Text, over the field. A Text takes no
// press, so in Qt a press on it is the field's; an item that takes the
// press (a MouseArea) keeps it.
test("a press on a Text over a field is the field's, and one a MouseArea over it takes is not", async ({ page }) => {
  await open(page, "coveredfield");
  const focused = () => page.evaluate(() => ["covered", "area", "taken"].filter((name) => window.scene[name].activeFocus));
  await page.mouse.click(10 + 60, 10 + 20);
  expect(await focused()).toEqual(["covered"]);
  await page.keyboard.type("typed");
  expect(await page.evaluate(() => window.scene.covered.text)).toBe("typed");

  await page.mouse.click(10 + 60, 60 + 30);
  expect(await focused()).toEqual(["area"]);
  await page.keyboard.type("more");
  expect(await page.evaluate(() => window.scene.area.text)).toBe("more");

  await page.mouse.click(10 + 60, 140 + 20);
  expect(await page.evaluate(() => window.scene.presses)).toBe(1);
  expect(await focused()).toEqual(["area"]);
  expect(await page.evaluate(() => window.scene.taken.text)).toBe("");
});
