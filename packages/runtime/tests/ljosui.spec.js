// `Ljos.Ui` (and `Ljos.Layout`) on the web: the dialect's faces over the
// runtime's types (ljos-ui's `ljos_ui.rs` / `ljos_layout.rs` and the
// `Ljos.Ui` module of its type table). A face is the same object under
// Ljós's names: `fill` is `color`'s slot, `font.size` is `font.pixelSize`,
// a `Tap` is a tap handler whose buttons are `buttons`.
import { expect, open, rect, test } from "./open.js";

const read = (page, name, property) => page.evaluate(([name, property]) => window.objects[name][property], [name, property]);
const log = (page) => page.evaluate(() => window.objects.log.splice(0));
const background = (page, name) =>
  page.evaluate((name) => getComputedStyle(window.objects[name].$node).backgroundColor, name);
const advance = (page, ms) => page.evaluate((ms) => window.objects.clock.advance(ms), ms);

test("a Rectangle's fill is its colour, read, written and told of as fill", async ({ page }) => {
  await open(page, "ljosui");
  expect(await background(page, "box")).toBe("rgb(255, 99, 71)");
  // The same slot by both names: what the dialect wrote, Qt's name reads
  // (a colour read back is its value: `r`, `g`, `b`, `a`).
  const same = () =>
    page.evaluate(() => {
      const { fill, color } = window.objects.box;
      return fill.r === color.r && fill.g === color.g && fill.b === color.b;
    });
  expect(await same()).toBe(true);
  await page.evaluate(() => {
    window.objects.box.fill = "seagreen";
    window.flush();
  });
  expect(await log(page)).toEqual([expect.stringContaining("fill")]);
  expect(await same()).toBe(true);
  // The Behavior on fill moves what is shown there.
  await advance(page, 200);
  expect(await background(page, "box")).toBe("rgb(46, 139, 87)");
});

test("a state changes a Rectangle by its dialect name", async ({ page }) => {
  await open(page, "ljosui");
  await page.evaluate(() => {
    window.objects.root.blue = true;
    window.flush();
  });
  // The Behavior on fill is showing it on its way; then it is there.
  await advance(page, 200);
  expect(await background(page, "box")).toBe("rgb(70, 130, 180)");
  await page.evaluate(() => {
    window.objects.root.blue = false;
    window.flush();
  });
  await advance(page, 200);
  expect(await background(page, "box")).toBe("rgb(255, 99, 71)");
});

test("Text takes font.size, align, wrap and format", async ({ page }) => {
  await open(page, "ljosui");
  expect(await read(page, "label", "text")).toBe("Hello");
  expect(await page.evaluate(() => window.objects.label.font.size)).toBe(20);
  expect(await page.evaluate(() => window.objects.label.font.pixelSize)).toBe(20);
  expect(await read(page, "label", "align")).toBe(4);
  expect(await read(page, "label", "horizontalAlignment")).toBe(4);
  expect(await read(page, "label", "wrap")).toBe(1);
  expect(await read(page, "label", "format")).toBe(0);
  // Ljos.Layout's Column puts the small rectangle under the box (spacing 5).
  const box = await rect(page, "box");
  const small = await rect(page, "small");
  expect(small.y).toBe(box.y + box.height + 5);
  const label = await rect(page, "label");
  expect(label.height).toBeGreaterThan(0);
});

test("a Tap child taps, and its buttons are the handler's", async ({ page }) => {
  await open(page, "ljosui");
  await page.mouse.click(10, 10);
  expect(await log(page)).toContain("tapped");
});

test("gestures take buttons by Ljós's name; a PointerArea clicks", async ({ page }) => {
  await open(page, "ljosuigesture");
  expect(await read(page, "tap", "buttons")).toBe(2);
  expect(await read(page, "tap", "acceptedButtons")).toBe(2);
  await page.mouse.click(10, 10);
  expect(await log(page)).not.toContain("right tapped");
  await page.mouse.click(10, 10, { button: "right" });
  expect(await log(page)).toContain("right tapped");
  await page.mouse.move(300, 250);
  await log(page);
  await page.mouse.move(20, 20);
  expect(await log(page)).toContain("hover true");
  await page.mouse.click(150, 50);
  expect(await log(page)).toContain("pointer clicked");
});

test("a dialect file compiled by qmlc draws what its compat twin draws", async ({ page }) => {
  const drawn = async (scene) => {
    await open(page, scene);
    await page.mouse.click(10, 10);
    return page.evaluate(() => {
      const { theBox: box, theLabel: label, taps } = window.scene;
      // To the pixel: a text's measure is fractional in the browser.
      const at = (item) => {
        const { x, y, width, height } = item.$node.getBoundingClientRect();
        return [x, y, width, height].map(Math.round);
      };
      return {
        box: at(box),
        fill: getComputedStyle(box.$node).backgroundColor,
        radius: getComputedStyle(box.$node).borderRadius,
        label: at(label),
        text: label.text,
        taps,
      };
    });
  };
  const dialect = await drawn("ljosuidialect");
  const compat = await drawn("ljosuicompat");
  expect(dialect).toEqual(compat);
  expect(dialect.fill).toBe("rgb(255, 99, 71)");
  expect(dialect.taps).toBe(1);
});

test("what Ljos.Ui, Ljos.Core and Ljos.Models keep of Qt Quick runs in a file of Ljós's API", async ({ page }) => {
  await open(page, "ljosmodules");
  const read = () =>
    page.evaluate(() => {
      const { theGrid: grid, thePath: path, theTurned: turned, made, keys, settings, painted } = window.scene;
      const { width, height } = turned.$node.getBoundingClientRect();
      return {
        cells: grid.count,
        current: getComputedStyle(grid.itemAtIndex(0).$node).backgroundColor,
        other: getComputedStyle(grid.itemAtIndex(1).$node).backgroundColor,
        made,
        keys,
        settings: [settings.objectName, settings.size],
        parts: path.count,
        turned: [Math.round(width), Math.round(height)],
        painted: painted > 0,
      };
    });
  await expect.poll(async () => (await read()).painted).toBe(true);
  expect(await read()).toEqual({
    cells: 3,
    current: "rgb(255, 99, 71)",
    other: "rgb(46, 139, 87)",
    made: 2,
    // `Object.keys` in a script is JavaScript's, beside Ljos.Core's `Object`.
    keys: 2,
    settings: ["settings", 3],
    parts: 2,
    // Turned a quarter, then twice as wide: 40 by 40 where it was 40 by 20.
    turned: [40, 40],
    painted: true,
  });
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => window.scene.theSecond.activeFocus)).toBe(true);
});

test("`import Ljos` has SystemMenu, which a page has no menu bar for, and says which of its types the web has not", async ({ page }) => {
  await open(page, "ljosroot");
  const read = await page.evaluate(() => {
    const { menu, ErrorBoundary, SelectionScope, SystemMenu, make } = window.objects;
    const said = (work) => {
      try {
        work();
      } catch (error) {
        return error.message;
      }
    };
    return {
      roles: [SystemMenu.TextHeuristicRole, SystemMenu.NoRole, SystemMenu.WindowRole],
      role: SystemMenu.attached(menu).role,
      boundary: said(() => make(ErrorBoundary)),
      scope: said(() => make(SelectionScope)),
    };
  });
  expect(read).toEqual({
    roles: [0, 1, 2],
    // Said, and kept: off macOS it changes nothing, natively too.
    role: 2,
    boundary: "Ljos: ErrorBoundary is not in ljos-web yet",
    scope: "Ljos: SelectionScope is not in ljos-web yet",
  });
});

test("a padded Row is as big as its children and its padding, and lays them out inside it", async ({ page }) => {
  await open(page, "ljosuilayout");
  const at = async (name) => [await read(page, name, "x"), await read(page, name, "y")];
  expect([await read(page, "padded", "implicitWidth"), await read(page, "padded", "implicitHeight")]).toEqual([105, 40]);
  expect(await at("a")).toEqual([10, 10]);
  expect(await at("b")).toEqual([65, 10]);
  // Padding taken away, the base layout has it again, to the pixel.
  await page.evaluate(() => {
    window.objects.padded.padding = 0;
    window.flush();
  });
  expect([await read(page, "padded", "implicitWidth"), await read(page, "padded", "implicitHeight")]).toEqual([85, 20]);
  expect(await at("a")).toEqual([0, 0]);
  expect(await at("b")).toEqual([55, 0]);
});

test("a Box turns, a Grid's spacings follow its spacing, and Pages shows one child", async ({ page }) => {
  await open(page, "ljosuilayout");
  const at = async (name) => [await read(page, name, "x"), await read(page, name, "y")];
  expect(await at("d")).toEqual([55, 0]);
  await page.evaluate(() => {
    window.objects.turning.direction = 1; // Box.Column
    window.flush();
  });
  expect(await at("d")).toEqual([0, 25]);
  expect(await at("g1")).toEqual([27, 0]);
  expect(await at("g2")).toEqual([0, 17]);
  await page.evaluate(() => {
    window.objects.cells.columnSpacing = 1;
    window.flush();
  });
  expect(await at("g1")).toEqual([21, 0]);
  expect(await read(page, "p0", "visible")).toBe(true);
  expect(await read(page, "p1", "visible")).toBe(false);
  await page.evaluate(() => {
    window.objects.pages.currentIndex = 1;
    window.flush();
  });
  expect(await read(page, "p0", "visible")).toBe(false);
  expect(await read(page, "p1", "visible")).toBe(true);
});

test("DragSource is the Drag a DropArea is told of", async ({ page }) => {
  await open(page, "ljosuidrag");
  const step = (index) => page.evaluate((index) => window.scene.step(index), index);
  const readScene = () => page.evaluate(() => window.scene.read());
  await step(0);
  expect(await readScene()).toEqual([["active true"], true, true, false, 10]);
  await step(1);
  expect(await readScene()).toEqual([["entered"], true, true, true, 10]);
  await step(2);
  const [said, active] = await readScene();
  expect(said).toContain("dropped");
  expect(active).toBe(false);
});

test("a Loader shows its component, and a control's font takes font.size", async ({ page }) => {
  await open(page, "ljosuiloader");
  expect(await log(page)).toContain("loaded 60");
  expect(await read(page, "loader", "sourceComponent")).toBe(await page.evaluate(() => window.objects.loader.component));
  expect(await page.evaluate(() => [window.objects.direct.font.size, window.objects.direct.font.pixelSize])).toEqual([24, 24]);
  expect(await page.evaluate(() => [window.objects.inherited.font.size, window.objects.inherited.font.pixelSize])).toEqual([20, 20]);
  // Mixed over the Panes around a Label, the nearest Pane's size is
  // the Label's, by whichever of the three names it was said in; two
  // names on the one Pane resolve as they do on a control itself:
  // a directly given `pixelSize` is the slot's own word.
  const pixelsOf = (name) => page.evaluate((name) => window.objects[name].font.pixelSize, name);
  expect(await pixelsOf("nearPixels")).toBe(12);
  expect(await pixelsOf("nearPoints")).toBe(12);
  expect(await pixelsOf("nearSize")).toBe(12);
  expect(await pixelsOf("both")).toBe(10);
});

test("a font as a value takes size, and sets an item at that size", async ({ page }) => {
  await open(page, "ljosuifont");
  // `Qt.font({ size: 20 })` is made without throwing, and reads back
  // by all three names, as an item's font resolves them.
  expect(await page.evaluate(() => [window.objects.made.size, window.objects.made.pixelSize, window.objects.made.pointSize])).toEqual([20, 20, 15]);
  // The three names together: a pixel name wins over a point size
  // beside it, a directly given `pixelSize` over `size`, and the
  // point size over both together.
  expect(await page.evaluate(() => window.objects.mixed.map((f) => [f.size, f.pixelSize, f.pointSize]))).toEqual([
    [20, 20, 15],
    [10, 10, 7.5],
    [40, 40, 30],
  ]);
  expect(await page.evaluate(() => window.objects.app.font.size)).toBe(12);
  expect(await page.evaluate(() => [window.objects.label.font.size, window.objects.label.font.pixelSize])).toEqual([20, 20]);
  // And it draws at that size: taller than the same text at the default.
  const label = await rect(page, "label");
  const plain = await rect(page, "plain");
  expect(label.height).toBeGreaterThan(plain.height);
  // `size` is the pixel size by its other name on the item too: a
  // later `font.pixelSize` write is what `font.size` reads, not the
  // size the given font value carried.
  await page.evaluate(() => {
    window.objects.label.font.pixelSize = 30;
    window.flush();
  });
  expect(await page.evaluate(() => [window.objects.label.font.size, window.objects.label.font.pixelSize])).toEqual([30, 30]);
});

test("a Drag child drags its item", async ({ page }) => {
  await open(page, "ljosuigesture");
  await page.mouse.move(10, 110);
  await page.mouse.down();
  await page.mouse.move(60, 110, { steps: 5 });
  await page.mouse.up();
  const dragged = await rect(page, "dragged");
  expect(dragged.x).toBe(50);
});

// Ljós's reduced motion (ljos-ui's ARCHITECTURE §14): asked for less
// motion, what an animation in a file of Ljós's API would slide, grow or
// turn is where it goes at once, a number of the file's own too (it may
// well place something), and what it fades or recolours fades, in at
// most 150 ms, so the change still shows. A loop that never ends keeps
// its pace. In QML as Qt has it, reduced motion is the program's to say.
test("asked for less motion, a file of Ljós's API moves nothing and still fades", async ({ page }) => {
  const watch = async (scene, motion) => {
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto(`/?scene=${scene}&still`);
    await page.waitForFunction(() => window.ready);
    return page.evaluate(() => {
      const { scene: root, clock, flush } = window;
      const slider = root.slider;
      const at = () => ({ x: slider.x, open: root.open, opacity: slider.opacity, fill: getComputedStyle(slider.$node).backgroundColor, blink: root.blink.opacity });
      root.moved = true;
      flush();
      clock.advance(16);
      const started = at();
      clock.advance(134);
      const soon = at();
      // The loop, from where it is: it goes on at a turn a second.
      const turned = root.spin;
      clock.advance(250);
      return { started, soon, spun: root.spin - turned };
    });
  };
  const calm = await watch("ljosuimotion", "reduce");
  expect(calm.started.x).toBe(200);
  expect(calm.started.open).toBe(1);
  expect(calm.started.opacity).toBeGreaterThan(0.2);
  expect(calm.started.opacity).toBeLessThan(1);
  expect(calm.started.fill).not.toBe("rgb(70, 130, 180)");
  // A fade asked to take no time is not lengthened to the calm fade's.
  expect(calm.started.blink).toBeCloseTo(0.5, 5);
  expect(calm.soon.opacity).toBeCloseTo(0.2, 5);
  expect(calm.soon.fill).toBe("rgb(70, 130, 180)");
  expect(calm.spun).toBeCloseTo(90, 0);
  // With no preference, the same file moves as it says.
  const full = await watch("ljosuimotion", "no-preference");
  expect(full.soon.x).toBeGreaterThan(0);
  expect(full.soon.x).toBeLessThan(200);
  expect(full.soon.open).toBeLessThan(1);
  expect(full.soon.opacity).toBeGreaterThan(0.2);
  // Qt's form leaves it to the program.
  const qt = await watch("ljosuimotioncompat", "reduce");
  expect(qt.soon.x).toBeGreaterThan(0);
  expect(qt.soon.x).toBeLessThan(200);
  expect(qt.soon.open).toBeGreaterThan(0);
  expect(qt.soon.open).toBeLessThan(1);
});

// What Ljós's `Ljos.Ui` has of Qt Quick as Qt Quick has it (ljos-ui's
// type table maps each to its QtQuick type), so a file of Ljós's API
// mirrors, counts frames and draws effects with no `QtQuick` import; and
// the `MotionPreference` enum, whose keys are Ljós's.
test("Ljos.Ui has LayoutMirroring, FrameAnimation, RectangularShadow, MultiEffect and MotionPreference", async ({ page }) => {
  await open(page, "ljosuieffects");
  const read = () =>
    page.evaluate(() => {
      const { mirrored, leading, frames, shadow, effect, ticks, reduced, motion, mirroring } = window.scene;
      const box = (item) => item.$node.getBoundingClientRect();
      return {
        // Mirrored, what is anchored to the left is at the right.
        right: Math.round(box(leading).right - box(mirrored).left),
        mirroring,
        running: frames.running,
        ticks,
        shadow: [shadow.width, shadow.height, shadow.blur],
        effect: [effect.width, effect.height, effect.colorization],
        reduced,
        motion,
      };
    });
  await expect.poll(async () => (await read()).ticks).toBeGreaterThan(0);
  expect(await read()).toMatchObject({
    right: 200,
    mirroring: true,
    running: true,
    shadow: [60, 40, 10],
    effect: [40, 40, 1],
    reduced: false,
    motion: [0, 1],
  });
  // Asked for less motion, the hint is the enum's `Reduced`.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "ljosuieffects");
  expect(await page.evaluate(() => window.scene.reduced)).toBe(true);
});
