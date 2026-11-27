// A running app's lines of text each stand in their own room: none is
// shorter than its letters, and none lies on another. Firefox sets no font
// larger than 2000px, and the runtime once read a face's ascent and descent
// at 10000px, so there every line was a fifth as tall as its text and the
// lines under it were laid over it. This runs in every project, Firefox's
// too (playwright.config.js, LJOS_E2E_FIREFOX).
import { expect, open, test, unexpected } from "./fixtures.js";

// Every line of text drawn inside the element the first shown `marker` text
// stands in, `up` levels above it: its words, its box and its font size. A
// copy that is not shown can stay behind: the front page's agent replay keeps
// the list it turned into a board, at no size.
async function linesAround(page, marker, up) {
  const text = page.locator("#app div.qq-text").filter({ hasText: new RegExp(`^${marker}$`), visible: true }).first();
  await expect(text, `${marker} is drawn`).toBeVisible();
  return text.evaluate((element, up) => {
    let scope = element;
    for (let level = 0; level < up && scope.parentElement; level++) scope = scope.parentElement;
    const lines = [];
    for (const each of scope.querySelectorAll("div.qq-text")) {
      const words = each.textContent.trim();
      const box = each.getBoundingClientRect();
      const style = getComputedStyle(each);
      if (!words || box.width < 1 || box.height < 1 || style.visibility === "hidden" || style.opacity === "0") continue;
      lines.push({ words, size: parseFloat(style.fontSize), x: box.x, y: box.y, width: box.width, height: box.height });
    }
    return lines;
  }, up);
}

// How the lines are wrong: a line shorter than its font, a pair laid over
// each other by more than a pixel each way.
function faults(lines) {
  const found = [];
  for (const line of lines) {
    if (line.height < line.size * 0.9) found.push(`"${line.words}" is ${line.height}px tall in a ${line.size}px font`);
  }
  for (let one = 0; one < lines.length; one++) {
    for (let other = one + 1; other < lines.length; other++) {
      const a = lines[one];
      const b = lines[other];
      const across = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const down = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (across > 1 && down > 1) found.push(`"${a.words}" lies on "${b.words}"`);
    }
  }
  return found;
}

test("the front page's board keeps each line in its own room", async ({ page, errors }) => {
  await open(page, "/");
  // The board's card: its title, the count under it and every ticket. The
  // replay can swap the shown copy between finding the title and reading
  // around it, so it is read again until the copy read is the drawn one.
  let lines = [];
  await expect(async () => {
    lines = await linesAround(page, "North district dispatch", 4);
    expect(lines.length, "the board draws its lines").toBeGreaterThan(5);
  }).toPass({ timeout: 10_000 });
  expect(faults(lines)).toEqual([]);
  expect(unexpected(errors)).toEqual([]);
});

test("the Pantry keeps each line in its own room", async ({ page, errors }) => {
  await open(page, "/");
  const lines = await linesAround(page, "The Corner Pantry", 4);
  expect(lines.length, "the Pantry draws its lines").toBeGreaterThan(1);
  expect(faults(lines)).toEqual([]);
  expect(unexpected(errors)).toEqual([]);
});

test("the front page's board keeps its lines at phone width", async ({ page, errors }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "/");
  const lines = await linesAround(page, "North district dispatch", 4);
  expect(faults(lines)).toEqual([]);
  expect(unexpected(errors)).toEqual([]);
});
