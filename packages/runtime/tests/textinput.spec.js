import { expect, open, test } from "./open.js";

async function fields(page) {
  await open(page, "textinput");
  await page.waitForFunction(() => window.objects.boxes.status === 1);
}

const call = (page, body, ...args) => page.evaluate(body, ...args);

// The text, and the selection as Qt reports it: start, end, cursor, selected.
const state = (page, name) =>
  page.evaluate((name) => {
    const { text, selectionStart, selectionEnd, cursorPosition, selectedText } = window.objects[name];
    return [text, selectionStart, selectionEnd, cursorPosition, selectedText];
  }, name);

const log = (page) => page.evaluate(() => window.objects.log.slice());

// Where the element typed into is, against its item.
const field = (page, name) =>
  page.evaluate((name) => {
    const item = window.objects[name];
    const box = item.$input.getBoundingClientRect();
    const frame = item.$node.getBoundingClientRect();
    return [box.x - frame.x, box.y - frame.y, box.width, box.height];
  }, name);

// What `qml6` prints for the scene: text, width, height, implicitWidth,
// implicitHeight, contentWidth, contentHeight, baselineOffset,
// cursorPosition, length, then displayText and acceptableInput.
const QT_INPUTS = {
  name: ["Hello", 40, 16, 40, 16, 40, 16, 13, 5, 5, "Hello", true],
  boxed: ["abc", 200, 40, 34, 26, 24, 16, 25, 3, 3, "abc", true],
  secret: ["abc", 150, 16, 24, 16, 24, 16, 13, 3, 3, "***", true],
  number: ["", 150, 16, 0, 16, 0, 16, 13, 0, 0, "", false],
  word: ["", 150, 16, 0, 16, 0, 16, 13, 0, 0, "", false],
  amount: ["", 150, 16, 0, 16, 0, 16, 13, 0, 0, "", false],
  short: ["Hello", 150, 16, 40, 16, 40, 16, 13, 5, 5, "Hello", true],
  fixed: ["fixed", 150, 16, 40, 16, 40, 16, 13, 5, 5, "fixed", true],
};

// The same of a TextEdit, which ends with its lineCount.
const QT_EDITS = {
  notes: ["one two three four five", 80, 48, 168, 48, 76, 48, 13, 0, 23, 3],
  lines: ["ab\nabcd", 32, 32, 32, 32, 32, 32, 13, 0, 7, 2],
  low: ["abc", 150, 80, 44, 36, 24, 16, 67, 0, 3, 1],
};

test("a field is as large as Qt makes it, and its element is where the text is", async ({ page }) => {
  await fields(page);
  const read = await page.evaluate(
    ([inputs, edits]) => {
      const sizes = (item) => {
        const {
          text,
          width,
          height,
          implicitWidth,
          implicitHeight,
          contentWidth,
          contentHeight,
          baselineOffset,
          cursorPosition,
          length,
        } = item;
        return [
          text,
          width,
          height,
          implicitWidth,
          implicitHeight,
          contentWidth,
          contentHeight,
          baselineOffset,
          cursorPosition,
          length,
        ];
      };
      const { objects } = window;
      return {
        inputs: Object.fromEntries(
          inputs.map((name) => [name, [...sizes(objects[name]), objects[name].displayText, objects[name].acceptableInput]]),
        ),
        edits: Object.fromEntries(edits.map((name) => [name, [...sizes(objects[name]), objects[name].lineCount]])),
        mirror: objects.mirror.text,
      };
    },
    [Object.keys(QT_INPUTS), Object.keys(QT_EDITS)],
  );
  expect(read).toEqual({ inputs: QT_INPUTS, edits: QT_EDITS, mirror: "Hello 5  false" });
  expect(await field(page, "name")).toEqual([0, 0, 40, 16]);
  // Padded by 5, and centred in what is left of the height.
  expect(await field(page, "boxed")).toEqual([5, 12, 190, 16]);
  expect(await field(page, "notes")).toEqual([0, 0, 80, 48]);
  expect(await field(page, "low")).toEqual([10, 10, 130, 60]);
  const look = await page.evaluate(() => {
    const { boxed, secret, low, name } = window.objects;
    const style = getComputedStyle(boxed.$input);
    return {
      tags: [name.$input.localName, name.$input.type, secret.$input.type, low.$input.localName],
      boxed: [style.color, style.textAlign, style.fontSize, style.lineHeight, style.caretColor],
      selection: [style.getPropertyValue("--qq-selection"), style.getPropertyValue("--qq-selected")],
      // The text of a TextEdit is pushed down to the bottom of its box.
      low: [getComputedStyle(low.$input).textAlign, getComputedStyle(low.$input).paddingTop],
    };
  });
  expect(look).toEqual({
    tags: ["input", "text", "password", "textarea"],
    boxed: ["rgb(255, 0, 0)", "right", "16px", "16px", "rgb(255, 0, 0)"],
    selection: ["yellow", "blue"],
    low: ["center", "44px"],
  });
});

test("typing edits the text, moves the cursor and says so", async ({ page }) => {
  await fields(page);
  // Between the third letter and the fourth.
  await page.mouse.click(25, 8);
  expect(
    await call(page, () => [window.objects.name.activeFocus, window.objects.name.focus, window.objects.name.cursorPosition]),
  ).toEqual([true, true, 3]);
  await page.keyboard.type("!x");
  expect(await state(page, "name")).toEqual(["Hel!xlo", 5, 5, 5, ""]);
  expect(
    await call(page, () => [window.objects.name.implicitWidth, window.objects.name.width, window.objects.mirror.text]),
  ).toEqual([56, 56, "Hel!xlo 5  true"]);
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  expect(await state(page, "name")).toEqual(["Hel!xlo", 3, 4, 3, "!"]);
  await page.keyboard.press("Backspace");
  expect(await state(page, "name")).toEqual(["Helxlo", 3, 3, 3, ""]);
  // Leaving the field finishes the editing.
  await page.mouse.click(10, 118);
  expect(await log(page)).toEqual([
    "edited Hel!lo",
    "edited Hel!xlo",
    "accepted Hel!xlo",
    "finished Hel!xlo",
    "edited Helxlo",
    "finished Helxlo",
  ]);
  expect(await call(page, () => [window.objects.name.activeFocus, window.objects.number.activeFocus])).toEqual([false, true]);
});

test("a validator refuses what could never be right and accepts only what is", async ({ page }) => {
  await fields(page);
  await page.mouse.click(10, 118);
  await page.keyboard.type("5a7");
  // 57 is not between 10 and 30, though it could become a number that is.
  expect(await call(page, () => [window.objects.number.text, window.objects.number.acceptableInput])).toEqual(["57", false]);
  await page.keyboard.press("Enter");
  expect(await log(page)).toEqual([]);
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("25");
  await page.keyboard.press("Enter");
  expect(await call(page, () => [window.objects.number.text, window.objects.number.acceptableInput])).toEqual(["25", true]);
  expect(await log(page)).toEqual(["number 25"]);
  await page.mouse.click(10, 178);
  await page.keyboard.type("3.141");
  expect(await call(page, () => [window.objects.amount.text, window.objects.amount.acceptableInput])).toEqual(["3.14", true]);
  await page.keyboard.type("-");
  expect(await call(page, () => window.objects.amount.text)).toBe("3.14");
  await page.mouse.click(10, 148);
  await page.keyboard.type("abc");
  expect(await call(page, () => [window.objects.word.text, window.objects.word.acceptableInput])).toEqual(["abc", true]);
  await page.keyboard.type("d");
  expect(await call(page, () => window.objects.word.acceptableInput)).toBe(false);
  // What a program assigns is kept, acceptable or not, as in Qt.
  const assigned = await call(page, () => {
    const { number } = window.objects;
    number.text = "300";
    const high = [number.text, number.acceptableInput];
    number.text = "3x";
    return [high, [number.text, number.acceptableInput]];
  });
  expect(assigned).toEqual([
    ["300", false],
    ["3x", false],
  ]);
});

test("a field takes no more than its maximum length, and nothing when it is read-only", async ({ page }) => {
  await fields(page);
  await page.mouse.click(60, 208);
  await page.keyboard.type("!!");
  expect(await state(page, "short")).toEqual(["Hello", 5, 5, 5, ""]);
  await page.keyboard.press("Backspace");
  await page.keyboard.type("p!");
  expect(await state(page, "short")).toEqual(["Hellp", 5, 5, 5, ""]);
  await page.mouse.click(60, 238);
  await page.keyboard.type("zz");
  await page.keyboard.press("Backspace");
  expect(await state(page, "fixed")).toEqual(["fixed", 5, 5, 5, ""]);
  // `selectByMouse: false`: a drag selects nothing.
  await page.mouse.move(1, 238);
  await page.mouse.down();
  await page.mouse.move(30, 238, { steps: 5 });
  await page.mouse.up();
  expect((await state(page, "fixed"))[4]).toBe("");
  const longer = await call(page, () => {
    const { short } = window.objects;
    short.maximumLength = 3;
    const cut = [short.text, short.cursorPosition];
    short.text = "abcdefgh";
    return [cut, [short.text, short.cursorPosition], short.$input.maxLength];
  });
  // What is already there is cut too.
  expect(longer).toEqual([["Hel", 3], ["abc", 3], 3]);
});

test("the selection is what was dragged over, or what a program selects", async ({ page }) => {
  await fields(page);
  await page.mouse.move(1, 8);
  await page.mouse.down();
  await page.mouse.move(25, 8, { steps: 5 });
  await page.mouse.up();
  expect(await state(page, "name")).toEqual(["Hello", 0, 3, 3, "Hel"]);
  expect(await call(page, () => window.objects.mirror.text)).toBe("Hello 3 Hel true");
  // The same calls, in Qt, give the same numbers.
  const read = await call(page, () => {
    const { name } = window.objects;
    const now = () => [name.text, name.selectionStart, name.selectionEnd, name.cursorPosition, name.selectedText];
    const out = [];
    name.text = "Hello, World";
    out.push(now());
    name.select(5, 2);
    out.push(now());
    name.insert(0, "zz");
    out.push(now());
    name.remove(0, 3);
    out.push(now());
    name.deselect();
    out.push(now());
    name.selectAll();
    out.push(now());
    name.cursorPosition = 3;
    out.push(now());
    name.cursorPosition = 100;
    out.push(now());
    out.push([name.getText(1, 4), name.length, name.$input.selectionStart, name.$input.selectionEnd]);
    name.clear();
    out.push(now());
    return out;
  });
  expect(read).toEqual([
    ["Hello, World", 12, 12, 12, ""],
    ["Hello, World", 2, 5, 2, "llo"],
    ["zzHello, World", 4, 7, 4, "llo"],
    ["ello, World", 1, 4, 1, "llo"],
    ["ello, World", 1, 1, 1, ""],
    ["ello, World", 0, 11, 11, "ello, World"],
    ["ello, World", 3, 3, 3, ""],
    ["ello, World", 3, 3, 3, ""],
    ["llo", 11, 3, 3],
    ["", 0, 0, 0, ""],
  ]);
});

test("focus is taken and given up by a program too", async ({ page }) => {
  await fields(page);
  const read = await call(page, () => {
    const { name, number } = window.objects;
    const now = () => [name.focus, name.activeFocus, document.activeElement === name.$input, number.activeFocus];
    const out = [now()];
    name.forceActiveFocus();
    out.push(now());
    number.focus = true;
    out.push(now());
    number.focus = false;
    out.push(now());
    return out;
  });
  expect(read).toEqual([
    [false, false, false, false],
    [true, true, true, false],
    [false, false, false, true],
    [false, false, false, false],
  ]);
  // The first field was acceptable when it lost the focus; the number never was.
  expect(await log(page)).toEqual(["finished Hello"]);
});

test("a password is typed without being shown", async ({ page }) => {
  await fields(page);
  await page.mouse.click(60, 88);
  await page.keyboard.type("d");
  const read = await call(page, () => {
    const { secret } = window.objects;
    const hidden = [secret.text, secret.displayText, secret.$input.type, secret.contentWidth];
    secret.echoMode = 0;
    window.flush();
    return [hidden, [secret.displayText, secret.$input.type, secret.$input.value]];
  });
  expect(read).toEqual([
    ["abcd", "****", "password", 32],
    ["abcd", "text", "abcd"],
  ]);
});

test("a TextEdit holds lines, and grows with them", async ({ page }) => {
  await fields(page);
  // After the last word, on the third line.
  await page.mouse.click(220 + 36, 40);
  await page.keyboard.type("Z");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Q");
  expect(await state(page, "notes")).toEqual(["one two three four fiveZ\nQ", 26, 26, 26, ""]);
  expect(
    await call(page, () => [window.objects.notes.lineCount, window.objects.notes.height, window.objects.notes.contentWidth]),
  ).toEqual([4, 64, 76]);
  expect(await field(page, "notes")).toEqual([0, 0, 80, 64]);
  // The element holds no more than its box: nothing to scroll.
  expect(await call(page, () => window.objects.notes.$input.scrollHeight)).toBe(64);
  const read = await call(page, () => {
    const { lines } = window.objects;
    const now = () => [
      lines.text,
      lines.selectionStart,
      lines.selectionEnd,
      lines.cursorPosition,
      lines.selectedText,
      lines.lineCount,
    ];
    const out = [];
    // Qt leaves the cursor of a TextEdit at the start when its text is set.
    lines.text = "abc";
    out.push(now());
    lines.cursorPosition = 2;
    lines.text = "abcdef";
    out.push(now());
    lines.append("x");
    out.push(now());
    lines.select(4, 1);
    out.push(now());
    lines.insert(0, "zz");
    out.push(now());
    out.push([lines.width, lines.height, lines.getText(0, 4)]);
    return out;
  });
  expect(read).toEqual([
    ["abc", 0, 0, 0, "", 1],
    ["abcdef", 0, 0, 0, "", 1],
    ["abcdef\nx", 0, 0, 0, "", 2],
    ["abcdef\nx", 1, 4, 1, "bcd", 2],
    ["zzabcdef\nx", 3, 6, 3, "bcd", 2],
    [64, 32, "zzab"],
  ]);
  await page.mouse.click(10, 118);
  expect(await log(page)).toEqual(["notes finished"]);
});

test("a press anywhere on a styled field, its placeholder too, puts the cursor in it", async ({ page }) => {
  await open(page, "styledfields");
  for (const [name, label] of [
    ["field", "Search query"],
    ["area", "Notes"],
  ]) {
    const box = await page.getByRole("textbox", { name: label }).boundingBox();
    // The middle is where the placeholder is drawn, over the field.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.type("ljós");
    await expect.poll(() => page.evaluate((n) => [window.objects[n].text, window.objects[n].activeFocus], name)).toEqual(["ljós", true]);
  }
  // A press on something in the field that takes it is that thing's.
  const box = await page.getByRole("textbox", { name: "With a button" }).boundingBox();
  await page.mouse.click(box.x + box.width - 10, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => window.scene.cleared)).toBe(1);
  expect(await page.evaluate(() => window.objects.area.activeFocus)).toBe(true);
});
