import { expect, open, rect, test } from "./open.js";

test("a Flickable's children are in its content item, which is as big as the content", async ({ page }) => {
  await open(page, "flickable");
  const read = await page.evaluate(() => {
    const { flick, inner, marks, plain, lone, extra } = window.objects;
    const content = flick.contentItem;
    const made = extra.createObject(flick);
    return {
      parents: [inner.parent === content, content.parent === flick, marks.itemAt(2).parent === content, made.parent === flick],
      children: [flick.children.length, flick.children[0] === content, content.children.length],
      content: [content.x, content.y, content.width, content.height],
      // With no content size, the content is as big as the Flickable.
      plain: [plain.contentWidth, plain.contentItem.width, plain.contentItem.height, lone.parent === plain.contentItem],
      ends: [plain.atXBeginning, plain.atXEnd, plain.atYBeginning, plain.atYEnd, flick.atYBeginning, flick.atYEnd],
      area: [plain.visibleArea.widthRatio, plain.visibleArea.heightRatio, flick.visibleArea.heightRatio, flick.visibleArea.yPosition],
    };
  });
  expect(read).toEqual({
    parents: [true, true, true, true],
    children: [2, true, 6],
    content: [0, 0, 300, 400],
    plain: [-1, 100, 80, true],
    ends: [true, true, true, true, true, false],
    area: [1, 1, 0.25, 0],
  });
  expect(await rect(page, "inner")).toEqual({ x: 10, y: 20, width: 50, height: 50 });
});

test("the content position scrolls the content, and scrolling sets the content position", async ({ page }) => {
  await open(page, "flickable");
  const read = await page.evaluate(() => {
    const { flick } = window.objects;
    flick.contentY = 50;
    flick.contentX = 30;
    return [flick.contentItem.x, flick.contentItem.y, flick.visibleArea.yPosition, flick.atYBeginning, flick.atXBeginning];
  });
  expect(read).toEqual([-30, -50, 0.125, false, false]);
  expect(await rect(page, "inner")).toEqual({ x: -20, y: -30, width: 50, height: 50 });
  // What the browser scrolls, the Flickable follows.
  await page.evaluate(() => window.objects.flick.$viewport.scrollTo(100, 300));
  await page.waitForFunction(() => window.objects.flick.contentY === 300 && !window.objects.flick.moving);
  const scrolled = await page.evaluate(() => {
    const { flick, log } = window.objects;
    return [flick.contentX, flick.contentY, flick.atXEnd, flick.atYEnd, flick.contentItem.y, log];
  });
  expect(scrolled).toEqual([100, 300, true, true, -300, ["started", "ended"]]);
  expect(await rect(page, "inner")).toEqual({ x: -90, y: -280, width: 50, height: 50 });
  // A position beyond the content is kept, as in Qt, until it is asked back.
  const beyond = await page.evaluate(() => {
    const { flick } = window.objects;
    flick.contentY = 5000;
    const seen = [flick.contentY, flick.contentItem.y, flick.$viewport.scrollTop];
    flick.returnToBounds();
    return [...seen, flick.contentY];
  });
  expect(beyond).toEqual([5000, -5000, 300, 300]);
});

test("a wheel moves the content", async ({ page }) => {
  await open(page, "flickable");
  await page.mouse.move(50, 50);
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(() => window.objects.flick.contentY === 120 && !window.objects.flick.moving);
  expect(await page.evaluate(() => window.objects.log)).toEqual(["started", "ended"]);
  expect(await rect(page, "inner")).toEqual({ x: 10, y: -100, width: 50, height: 50 });
  // One that is not interactive stays where it is.
  await page.mouse.move(250, 50);
  await page.evaluate(() => (window.objects.margins.interactive = false));
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.mouse.wheel(0, 120);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  expect(await page.evaluate(() => window.objects.margins.contentY)).toBe(-7);
});

// The browser's scroll chaining, which Qt has no part in. A Flickable keeps
// the overscroll along a way it flicks to itself, never along one it does
// not: a row of code that only goes sideways must not hold the page still.
// The wheel that turns a row sideways moves it to its end, and then the
// column it is in.
test("a wheel over a row that only goes sideways moves the row, and at its end the column", async ({ page }) => {
  await open(page, "sidewaysflick");
  const at = () => page.evaluate(() => [window.objects.row.contentX, window.objects.column.contentY]);
  const settled = () => page.waitForFunction(() => !window.objects.row.moving && !window.objects.column.moving);
  await page.mouse.move(150, 100);
  await page.mouse.wheel(0, 120);
  await expect.poll(at).toEqual([120, 0]);
  await settled();
  await page.mouse.wheel(0, 120);
  await expect.poll(at).toEqual([200, 0]);
  await settled();
  await page.mouse.wheel(0, 120);
  await expect.poll(at).toEqual([200, 120]);
  await settled();
  // Up, over what is left in sight of the row, the row comes back first.
  await page.mouse.move(150, 10);
  await page.mouse.wheel(0, -50);
  await expect.poll(at).toEqual([150, 120]);
});

test("a finger's swipe up over a row that only goes sideways scrolls the column", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 400, height: 300 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.goto("/?scene=sidewaysflick");
    await page.waitForFunction(() => window.ready);
    const device = await context.newCDPSession(page);
    await device.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 150, y: 140 }] });
    for (let step = 1; step <= 10; step++) await device.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 150, y: 140 - step * 10 }] });
    await device.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => page.evaluate(() => [window.objects.row.contentX, window.objects.column.contentY > 50])).toEqual([0, true]);
  } finally {
    await context.close();
  }
});

// A wheel listener that may cancel the scroll keeps Chromium from
// scrolling on its compositor: every wheel tick waits for the page's
// script. Only a Flickable that turns a wheel sideways cancels anything,
// so only one that goes sideways with no room to go down listens that way.
test("only a Flickable a wheel turns sideways holds the wheel back from the browser", async ({ page }) => {
  await page.addInitScript(() => {
    const held = new WeakMap();
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (type === "wheel" && !(typeof options === "object" && options?.passive)) held.set(this, (held.get(this) ?? 0) + 1);
      return add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      if (type === "wheel" && held.has(this)) held.set(this, held.get(this) - 1);
      return remove.call(this, type, listener, options);
    };
    window.holdsWheel = (object) => (held.get(object.$viewport) ?? 0) > 0;
  });
  await open(page, "sidewaysflick");
  expect(await page.evaluate(() => [window.holdsWheel(window.objects.column), window.holdsWheel(window.objects.row)])).toEqual([false, true]);
  // Turned upright, the row lets go; sideways again, it holds on.
  await page.evaluate(() => (window.objects.row.flickableDirection = 2));
  expect(await page.evaluate(() => window.holdsWheel(window.objects.row))).toBe(false);
  await page.evaluate(() => (window.objects.row.flickableDirection = 1));
  expect(await page.evaluate(() => window.holdsWheel(window.objects.row))).toBe(true);
  // The default direction, a page's scroller: content taller than it is
  // scrolled down by the browser, so the wheel is not held back. Content
  // only wider is turned sideways by the wheel, and is.
  await open(page, "flickable");
  const holds = () => page.evaluate(() => window.holdsWheel(window.objects.flick));
  expect(await page.evaluate(() => window.objects.flick.flickableDirection)).toBe(0);
  expect(await holds()).toBe(false);
  await page.evaluate(() => (window.objects.flick.contentHeight = 100));
  expect(await holds()).toBe(true);
  await page.evaluate(() => (window.objects.flick.contentHeight = 400));
  expect(await holds()).toBe(false);
});

// A column in a row: the wheel scrolls the column while it has room,
// and is never taken from it to turn the row. At the column's end the
// wheel turns the row.
test("a wheel over a column in a row that only goes sideways scrolls the column, and at its end the row", async ({ page }) => {
  await open(page, "uprightinrow");
  const at = () => page.evaluate(() => [window.objects.row.contentX, window.objects.column.contentY]);
  const settled = () => page.waitForFunction(() => !window.objects.row.moving && !window.objects.column.moving);
  await page.mouse.move(75, 100);
  await page.mouse.wheel(0, 120);
  await expect.poll(at).toEqual([0, 120]);
  await settled();
  await page.evaluate(() => (window.objects.column.contentY = 600));
  await settled();
  await page.mouse.wheel(0, 120);
  await expect.poll(at).toEqual([120, 600]);
});

test("margins put the content's beginning before zero", async ({ page }) => {
  await open(page, "flickable");
  const read = await page.evaluate(() => {
    const { margins } = window.objects;
    const area = margins.visibleArea;
    const style = getComputedStyle(margins.$viewport);
    const start = [margins.contentX, margins.contentY, margins.contentItem.x, margins.contentItem.y, area.widthRatio, area.heightRatio];
    margins.contentY = 311;
    return { start, end: [margins.atYEnd, area.yPosition], style: [style.overflowX, style.overflowY, style.overscrollBehaviorY] };
  });
  expect(read.start).toEqual([-3, -7, 3, 7, 200 / 303, 100 / 418]);
  expect(read.end).toEqual([true, 318 / 418]);
  expect(read.style).toEqual(["hidden", "auto", "none"]);
  expect(await rect(page, "corner")).toEqual({ x: 203, y: -311, width: 10, height: 10 });
});

test("flick() throws the content as far as its speed takes it", async ({ page }) => {
  await open(page, "flickable");
  const read = await page.evaluate(() => {
    const { flick } = window.objects;
    flick.contentY = 50;
    flick.flick(0, -500);
    return [flick.moving, flick.flicking, flick.flickingVertically, flick.movingHorizontally];
  });
  expect(read).toEqual([true, true, true, false]);
  await page.waitForFunction(() => !window.objects.flick.moving);
  const after = await page.evaluate(() => [window.objects.flick.contentY, window.objects.flick.flicking, window.objects.log]);
  // 500² / (2 × 1500) further on.
  expect(Math.abs(after[0] - (50 + 250000 / 3000))).toBeLessThan(1);
  expect(after.slice(1)).toEqual([false, ["started", "flick started", "flick ended", "ended"]]);
});

// What a view's content item holds, in a line: `name@x,y WxH zZ`.
const dump = (page, name) =>
  page.evaluate((name) => {
    const label = (item) => item.name ?? item.section ?? item.row ?? "?";
    return window.objects[name].contentItem.children.map((item) => `${label(item)}@${item.x},${item.y} ${item.width}x${item.height} z${item.z}`);
  }, name);

test("a ListView puts its header, sections, delegates, highlight and footer where Qt does", async ({ page }) => {
  await open(page, "listview");
  const read = await page.evaluate(() => {
    const { sections: view, empty } = window.objects;
    return {
      view: [view.contentY, view.originY, view.contentHeight, view.contentWidth, view.count, view.currentIndex, view.cacheBuffer],
      content: [view.contentItem.y, view.contentItem.height, view.atYBeginning, view.atYEnd],
      parts: [view.headerItem.y, view.footerItem.y, view.highlightItem.x, view.highlightItem.y, view.highlightItem.width],
      highlight: [view.highlightItem.height, view.highlightItem.z, view.currentItem === view.itemAtIndex(0)],
      at: [view.indexAt(10, 60), view.indexAt(10, 12), view.indexAt(190, 60), view.itemAt(10, 60) === view.itemAtIndex(1)],
      empty: [empty.currentIndex, empty.count, empty.contentHeight, empty.currentItem, empty.contentY],
    };
  });
  expect(read).toEqual({
    view: [-30, -30, 300, -1, 5, 0, 320],
    content: [30, 300, true, false],
    parts: [-30, 250, 0, 10, 180],
    highlight: [40, 0, true],
    at: [1, 0, -1, true],
    empty: [-1, 0, 0, null, 0],
  });
  expect((await dump(page, "sections")).sort()).toEqual(
    [
      "?@0,-30 200x30 z1",
      "?@0,250 200x20 z1",
      "?@0,10 180x40 z0",
      "x@0,0 200x10 z2",
      "a@0,10 180x40 z1",
      "b@0,55 180x40 z1",
      "y@0,100 200x10 z2",
      "c@0,110 180x40 z1",
      "d@0,155 180x40 z1",
      "z@0,200 200x10 z2",
      "e@0,210 180x40 z1",
    ].sort(),
  );
  // On the page: the header at the top, the first section under it.
  const boxes = await page.evaluate(() => {
    const { sections: view } = window.objects;
    return [view.headerItem, view.itemAtIndex(0), view.itemAtIndex(1)].map((item) => {
      const { x, y, width, height } = item.$node.getBoundingClientRect();
      return [x, y, width, height];
    });
  });
  expect(boxes).toEqual([
    [0, 0, 200, 30],
    [0, 40, 180, 40],
    [0, 85, 180, 40],
  ]);
});

test("ListView's attached properties tell a delegate of its view, its row and the sections around it", async ({ page }) => {
  await open(page, "listview");
  const read = await page.evaluate(() => {
    const { sections: view, letters, made } = window.objects;
    const infos = () => [0, 1, 2, 4].map((index) => view.itemAtIndex(index).info);
    const out = { start: infos() };
    view.currentIndex = 1;
    out.current = infos();
    // A row that changes section takes the label with it.
    letters.setProperty(1, "kind", "y");
    out.changed = infos();
    out.made = made.sections;
    return out;
  });
  expect(read).toEqual({
    start: ["x||x|true|true", "x|x|y|false|true", "y|x|y|false|true", "z|y||false|true"],
    current: ["x||x|false|true", "x|x|y|true|true", "y|x|y|false|true", "z|y||false|true"],
    changed: ["x||y|false|true", "y|x|y|true|true", "y|y|y|false|true", "z|y||false|true"],
    made: 5,
  });
  expect((await dump(page, "sections")).filter((line) => /^[a-z]@/.test(line)).sort()).toEqual(
    [
      "x@0,0 200x10 z2",
      "a@0,10 180x40 z1",
      "y@0,55 200x10 z2",
      "b@0,65 180x40 z1",
      "c@0,110 180x40 z1",
      "d@0,155 180x40 z1",
      "z@0,200 200x10 z2",
      "e@0,210 180x40 z1",
    ].sort(),
  );
});

test("positionViewAtIndex puts a row at the beginning, the middle or the end, as in Qt", async ({ page }) => {
  await open(page, "listview");
  const read = await page.evaluate(() => {
    const { sections: view } = window.objects;
    const { Beginning, Center, End, Visible, Contain } = view.$type;
    const out = [];
    const at = (move) => {
      move();
      out.push(view.contentY);
    };
    at(() => view.positionViewAtIndex(2, Beginning));
    at(() => view.positionViewAtIndex(2, Center));
    at(() => view.positionViewAtIndex(2, End));
    at(() => view.positionViewAtIndex(0, Beginning));
    at(() => view.positionViewAtIndex(0, Contain));
    at(() => view.positionViewAtIndex(4, Visible));
    at(() => view.positionViewAtBeginning());
    at(() => view.positionViewAtEnd());
    out.push(view.atYEnd);
    // The current item is brought into view, and the highlight with it.
    view.currentIndex = 1;
    out.push(view.contentY);
    view.currentIndex = 4;
    out.push(view.contentY, view.highlightItem.y, view.currentItem.name);
    return out;
  });
  expect(read).toEqual([100, 75, 50, 0, 0, 150, -30, 170, true, 55, 150, 210, "e"]);
});

test("a ListView makes delegates for the rows near what is shown and no others", async ({ page }) => {
  await open(page, "listview");
  const rows = () =>
    page.evaluate(() => {
      const { long } = window.objects;
      return long.contentItem.children.map((item) => item.row).sort((a, b) => a - b);
    });
  const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
  const start = await page.evaluate(() => {
    const { long, made } = window.objects;
    window.kept = long.itemAtIndex(10);
    return [long.count, long.contentHeight, made.long, long.itemAtIndex(15)];
  });
  // 100 shown and 320 kept ready beyond it, 30 a row.
  expect(start).toEqual([1000, 30000, 15, null]);
  expect(await rows()).toEqual(range(0, 14));
  // Scrolled by the browser: the rows that came into view are made, those
  // still near are the ones there were.
  await page.evaluate(() => window.objects.long.$viewport.scrollTo(0, 600));
  await page.waitForFunction(() => window.objects.long.contentY === 600 && !window.objects.long.moving);
  expect(await rows()).toEqual([0, ...range(9, 34)]);
  const scrolled = await page.evaluate(() => {
    const { long, made } = window.objects;
    return [made.long, long.itemAtIndex(10) === window.kept, long.itemAtIndex(20).y, long.currentItem === long.itemAtIndex(0)];
  });
  expect(scrolled).toEqual([35, true, 600, true]);
  expect(await page.evaluate(() => window.objects.long.itemAtIndex(21).$node.getBoundingClientRect().y)).toBe(30);
  // Far away: the rows there, not the ones on the way.
  const far = await page.evaluate(() => {
    const { long, made } = window.objects;
    long.contentY = 20000;
    return [made.long, long.contentHeight, long.originY, long.itemAtIndex(666).y, long.itemAtIndex(34)];
  });
  expect(far).toEqual([60, 30000, 0, 19980, null]);
  expect(await rows()).toEqual([0, ...range(656, 680)]);
  expect(await page.evaluate(() => window.objects.long.itemAtIndex(667).$node.getBoundingClientRect().y)).toBe(10);
  const end = await page.evaluate(() => {
    const { long, made } = window.objects;
    long.positionViewAtEnd();
    const out = [long.contentY, long.atYEnd, made.long];
    long.positionViewAtIndex(0, long.$type.Beginning);
    return [...out, long.contentY, made.long];
  });
  // 14 rows at the end, then 14 at the beginning: the first was kept.
  expect(end).toEqual([29900, true, 74, 0, 88]);
  // Fewer rows: those there are delegates for stay.
  const fewer = await page.evaluate(() => {
    const { long, root, made } = window.objects;
    root.rows = 5;
    const out = [long.count, long.contentHeight, made.long, long.contentItem.children.length];
    root.rows = 8;
    return [...out, long.count, long.contentHeight, made.long];
  });
  expect(fewer).toEqual([5, 150, 88, 5, 8, 240, 91]);
});

test("rows as long as they like are estimated as Qt estimates them", async ({ page }) => {
  await open(page, "listview");
  const read = await page.evaluate(() => {
    const { sizes: view, root } = window.objects;
    root.heights = Array.from({ length: 100 }, (_, index) => 20 + (index % 5) * 10);
    const rows = () =>
      view.contentItem.children
        .map((item) => item.row)
        .sort((a, b) => a - b)
        .map((row) => `${row}@${view.itemAtIndex(row).y}`)
        .join(" ");
    const state = () => [view.contentY, view.originY, view.contentHeight, rows()];
    const out = { start: state() };
    view.contentY = 60;
    out.near = state();
    view.contentY = 2000;
    out.far = state();
    view.positionViewAtIndex(50, view.$type.Beginning);
    out.positioned = state();
    view.positionViewAtEnd();
    out.end = [...state(), view.atYEnd];
    view.positionViewAtBeginning();
    out.beginning = [...state(), view.atYBeginning];
    return out;
  });
  // The rows without a delegate are as long as the average of the others:
  // where the content begins and ends moves as that changes.
  expect(read).toEqual({
    start: [0, 0, 3500, "0@0 1@20 2@50 3@90"],
    near: [60, -50, 5000, "0@-20 2@50 3@90 4@140"],
    far: [2000, 360, 4000, "0@380 41@2000 42@2030 43@2070"],
    positioned: [2360, 610, 3500, "0@625 50@2360 51@2380 52@2410 53@2450"],
    // The end as the two rows left there give it. (Qt's positionViewAtEnd
    // stops 25 short of the end it has by then worked out.)
    end: [4035, -1365, 5500, "0@-1330 98@4025 99@4075", true],
    // The first row asked for is at zero again.
    beginning: [0, 0, 3500, "0@0 1@20 2@50 3@90", true],
  });
  expect(await page.evaluate(() => window.objects.made.sizes)).toBeLessThan(30);
});

test("a ListView goes across, and starts where its current item is", async ({ page }) => {
  await open(page, "listview");
  const read = await page.evaluate(() => {
    const { across, ahead, made } = window.objects;
    const out = {
      across: [across.contentWidth, across.contentHeight, across.contentX, made.across, across.itemAtIndex(3).x, across.itemAtIndex(3).y],
      ahead: [ahead.contentY, ahead.contentHeight, ahead.currentItem.y, made.ahead, ahead.itemAtIndex(0)],
    };
    // Turned: the rows are under one another, and those there were are
    // not made again.
    across.orientation = across.$type.Vertical;
    out.turned = [across.contentWidth, across.contentHeight, across.itemAtIndex(3).x, across.itemAtIndex(3).y, made.across];
    across.orientation = across.$type.Horizontal;
    out.back = [across.contentWidth, across.contentHeight, across.itemAtIndex(3).x, across.itemAtIndex(3).y, made.across];
    across.positionViewAtIndex(20, across.$type.Beginning);
    out.positioned = [across.contentX, across.itemAtIndex(20).$node.getBoundingClientRect().x, made.across];
    return out;
  });
  expect(read).toEqual({
    across: [1558, -1, 0, 11, 156, 0],
    // The rows around the twentieth, and not the first ones.
    ahead: [530, 900, 600, 23, null],
    turned: [-1, 958, 0, 96, 14],
    back: [1558, -1, 156, 0, 14],
    positioned: [1040, 0, 31],
  });
});

test("rows that come, go and move leave the other delegates as they are", async ({ page }) => {
  await open(page, "listview");
  const step = (work) =>
    page.evaluate((work) => {
      const { dynamic: view, names, log, made } = window.objects;
      new Function("view", "names", work)(view, names);
      const rows = view.contentItem.children.map((item) => `${item.name}@${item.y}`).sort();
      return { log: log.splice(0), current: [view.currentIndex, view.currentItem?.name ?? null], count: view.count, made: made.dynamic, rows };
    }, work);
  expect(await step("")).toEqual({ log: [], current: [1, "b"], count: 4, made: 4, rows: ["a@0", "b@40", "c@80", "d@120"] });
  // The current item is the same one, one further on.
  expect(await step("names.insert(0, { name: 'z' })")).toEqual({
    log: ["add z", "cur 2"],
    current: [2, "b"],
    count: 5,
    made: 5,
    rows: ["a@40", "b@80", "c@120", "d@160", "z@0"],
  });
  expect(await step("names.remove(0)")).toEqual({
    log: ["remove z", "gone z", "cur 1"],
    current: [1, "b"],
    count: 4,
    made: 5,
    rows: ["a@0", "b@40", "c@80", "d@120"],
  });
  // The current one goes: the row that takes its place is current.
  expect(await step("names.remove(1)")).toEqual({
    log: ["remove b", "gone b"],
    current: [1, "c"],
    count: 3,
    made: 5,
    rows: ["a@0", "c@40", "d@80"],
  });
  expect(await step("names.move(0, 2, 1)")).toEqual({
    log: ["cur 0"],
    current: [0, "c"],
    count: 3,
    made: 5,
    rows: ["a@80", "c@0", "d@40"],
  });
  expect(await step("names.setProperty(1, 'name', 'D')")).toMatchObject({ log: [], made: 5, rows: ["D@40", "a@80", "c@0"] });
  expect(await step("view.incrementCurrentIndex(); view.incrementCurrentIndex(); view.incrementCurrentIndex()")).toMatchObject({
    log: ["cur 1", "cur 2"],
    current: [2, "a"],
  });
  expect(await step("view.currentIndex = 0; view.decrementCurrentIndex()")).toMatchObject({ log: ["cur 0"], current: [0, "c"] });
  expect(await step("view.keyNavigationWraps = true; view.decrementCurrentIndex()")).toMatchObject({ current: [2, "a"] });
  expect(await step("view.currentIndex = 77")).toMatchObject({ log: ["cur 77"], current: [77, null], made: 5 });
  expect(await step("view.currentIndex = -1")).toMatchObject({ current: [-1, null] });
  expect(await step("names.clear()")).toEqual({
    log: ["remove c", "remove D", "remove a", "gone c", "gone D", "gone a"],
    current: [-1, null],
    count: 0,
    made: 5,
    rows: [],
  });
  // An index that was set to none stays none.
  expect(await step("names.append({ name: 'n' })")).toEqual({ log: ["add n"], current: [-1, null], count: 1, made: 6, rows: ["n@0"] });
  // One that was never set is the first row, when there is one.
  const unset = await page.evaluate(() => {
    const { sections: view, letters } = window.objects;
    const out = [view.currentIndex];
    letters.clear();
    out.push(view.currentIndex, view.contentHeight, view.highlightItem);
    letters.append({ name: "n", kind: "x" });
    return [...out, view.currentIndex, view.currentItem.name, view.contentHeight, view.highlightItem.y];
  });
  expect(unset).toEqual([0, -1, 50, null, 0, "n", 100, 10]);
});

test("a view positioned by a handler of the change is laid out by then", async ({ page }) => {
  await open(page, "listview");
  const read = await page.evaluate(() => {
    const { root, dynamic, names } = window.objects;
    root.follow = true;
    const out = [];
    for (const name of ["x", "y", "z"]) {
      names.append({ name });
      out.push([dynamic.count, dynamic.contentY, dynamic.contentHeight, dynamic.atYEnd]);
    }
    return out;
  });
  expect(read).toEqual([
    [5, 100, 200, true],
    [6, 140, 240, true],
    [7, 180, 280, true],
  ]);
});

test("a view stays within its rows when some go, and snaps where it is told to", async ({ page }) => {
  await open(page, "listview");
  const read = await page.evaluate(() => {
    const { dynamic: view, names } = window.objects;
    view.currentIndex = 3;
    const out = [view.contentY];
    names.remove(3);
    out.push(view.contentY, view.currentIndex, view.contentHeight, view.atYEnd);
    const style = view.$viewport.style;
    out.push(style.scrollSnapType, view.$viewport.className);
    view.snapMode = view.$type.SnapOneItem;
    out.push(style.scrollSnapType, view.$viewport.className, getComputedStyle(view.itemAtIndex(1).$node).scrollSnapAlign);
    return out;
  });
  expect(read).toEqual([60, 20, 2, 120, true, "", "", "y mandatory", "qq-snap qq-snap-one", "start"]);
});

test("an ObjectModel's objects are shown by the view as they are", async ({ page }) => {
  await open(page, "listview");
  const read = await page.evaluate(() => {
    const { shown, things, thing, other } = window.objects;
    const out = {
      start: [shown.count, shown.contentHeight, thing.y, other.y, other.place, other.z, other.parent === shown.contentItem],
      items: [shown.itemAtIndex(1) === other, shown.currentItem === thing],
    };
    things.move(0, 1);
    out.moved = [thing.y, other.y, other.place, shown.currentIndex];
    things.remove(1);
    out.removed = [shown.count, shown.contentHeight, shown.contentItem.children.length, things.count];
    return out;
  });
  expect(read).toEqual({
    start: [2, 45, 0, 20, 1, 1, true],
    items: [true, true],
    moved: [25, 0, 0, 1],
    removed: [1, 25, 1, 1],
  });
  expect(await rect(page, "other")).toEqual({ x: 200, y: 200, width: 30, height: 25 });
});

test("a GridView puts its rows in cells, as many across as fit", async ({ page }) => {
  await open(page, "gridview");
  const read = await page.evaluate(() => {
    const { grid, columns, made } = window.objects;
    const header = grid.headerItem;
    const highlight = grid.highlightItem;
    const out = {
      grid: [grid.contentY, grid.originY, grid.contentHeight, grid.contentWidth, grid.count, grid.currentIndex, made.grid],
      parts: [header.y, grid.footerItem.y, highlight.x, highlight.y, highlight.width, highlight.height, highlight.z],
      attached: [grid.currentItem.current, grid.itemAtIndex(1).current, grid.currentItem.view === grid],
      at: [grid.indexAt(100, 70), grid.indexAt(75, 5), grid.indexAt(245, 5), grid.indexAt(200, 400), grid.itemAtIndex(4).x, grid.itemAtIndex(4).y],
      columns: [columns.contentX, columns.contentWidth, columns.contentHeight, made.columns],
    };
    grid.positionViewAtIndex(10, grid.$type.Beginning);
    out.positioned = [grid.contentY];
    grid.positionViewAtEnd();
    out.positioned.push(grid.contentY, grid.atYEnd);
    grid.currentIndex = 0;
    grid.moveCurrentIndexRight();
    grid.moveCurrentIndexDown();
    out.moved = [grid.currentIndex, grid.contentY, highlight.x, highlight.y, grid.itemAtIndex(4).current];
    grid.moveCurrentIndexUp();
    grid.moveCurrentIndexUp();
    grid.moveCurrentIndexLeft();
    grid.moveCurrentIndexLeft();
    out.moved.push(grid.currentIndex);
    return out;
  });
  expect(read).toEqual({
    grid: [-10, -10, 435, -1, 20, 0, 20],
    parts: [-10, 420, 0, 0, 70, 50, 0],
    attached: [true, false, true],
    at: [4, 0, -1, -1, 80, 60],
    columns: [0, 800, -1, 12],
    positioned: [180, 275, true],
    moved: [4, 0, 80, 60, true, 0],
  });
  const cells = (await dump(page, "grid")).filter((line) => /^\d+@/.test(line));
  expect(cells.slice(0, 5)).toEqual(["0@0,0 70x50 z1", "1@80,0 70x50 z1", "2@160,0 70x50 z1", "3@0,60 70x50 z1", "4@80,60 70x50 z1"]);
  expect(cells.at(-1)).toBe("19@80,360 70x50 z1");
  // Flowing down, then across.
  expect((await dump(page, "columns")).slice(0, 4)).toEqual(["0@0,0 70x50 z1", "1@0,60 70x50 z1", "2@80,0 70x50 z1", "3@80,60 70x50 z1"]);
});

test("a GridView makes delegates for the lines near what is shown, and keeps them", async ({ page }) => {
  await open(page, "gridview");
  const start = await page.evaluate(() => {
    const { many, made } = window.objects;
    window.kept = many.itemAtIndex(12);
    return [many.contentHeight, made.many, many.itemAtIndex(15)];
  });
  expect(start).toEqual([33400, 15, null]);
  await page.evaluate(() => window.objects.many.$viewport.scrollTo(0, 400));
  await page.waitForFunction(() => window.objects.many.contentY === 400 && !window.objects.many.moving);
  const scrolled = await page.evaluate(() => {
    const { many, made } = window.objects;
    const rows = many.contentItem.children.map((item) => item.row).sort((a, b) => a - b);
    const { x, y } = many.itemAtIndex(13).$node.getBoundingClientRect();
    return [made.many, rows[0], rows[1], rows.at(-1), rows.length, many.itemAtIndex(12) === window.kept, x, y];
  });
  // Lines 0 to 8, less the three they began with... and the current item.
  expect(scrolled).toEqual([27, 0, 1, 26, 27, true, 100, 150]);
  const changed = await page.evaluate(() => {
    const { many, named, names, made } = window.objects;
    // Narrower: two across, and the same delegates.
    many.width = 250;
    const out = [many.contentHeight, many.itemAtIndex(13).x, many.itemAtIndex(13).y, many.itemAtIndex(12) === window.kept];
    names.insert(0, { name: "z" });
    names.move(3, 1, 1);
    const cells = named.contentItem.children.map((item) => `${item.name}@${item.x},${item.y}`).sort();
    return [...out, made.named, named.currentIndex, named.contentHeight, cells];
  });
  expect(changed).toEqual([50000, 100, 600, true, 4, 2, 100, ["a@0,50", "b@50,50", "c@50,0", "z@0,0"]]);
});

// What Qt 6.11 answers for the same scene. Making a delegate that is in a
// state settles what has changed, and the view is among it while it is
// being laid out: it makes each row once all the same.
test("a view whose delegates are in a state makes each row once, also when its model is filled as it is made", async ({ page }) => {
  await open(page, "viewrefill");
  const answers = () => page.evaluate(() => JSON.parse(JSON.stringify(window.scene.answers())));
  const rows = (tag) => [0, 1, 2, 3].map((index) => [`${tag}${index}`, index * 30, index < 2 ? "#fa8a8a" : "#000000"]);
  expect(await answers()).toEqual([4, rows("a")]);
  await page.evaluate(() => window.scene.step(0));
  expect(await answers()).toEqual([8, rows("b")]);
});
