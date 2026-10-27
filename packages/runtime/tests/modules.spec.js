import { expect, test } from "@playwright/test";
import { open } from "./open.js";

test("a module of Qt's is what the runtime has of it and the QML Qt has", async ({ page }) => {
  await open(page, "modules");
  const read = await page.evaluate(() => {
    const { shelf, rack, Shelf, Text, RowLayout, names } = window.objects;
    return {
      // The style nothing chose is the one the module says is its default,
      // and brings what it imports.
      size: [shelf.width, shelf.height],
      names: names.sort(),
      // A QML file of a module the runtime has is one more type of it.
      spacing: rack.spacing,
      row: typeof RowLayout,
      // The component is read for what the type of its root has.
      elide: [Text.ElideRight, Shelf.ElideRight, shelf.elide],
    };
  });
  expect(read.size).toEqual([30, 10]);
  expect(read.names).toEqual(expect.arrayContaining(["Shelf", "Rack", "RowLayout"]));
  expect(read.spacing).toBe(7);
  expect(read.row).toBe("function");
  expect(read.elide).toEqual([1, 1, 1]);
});

test("a type Qt has and the runtime does not is there to be named, and says so when it is used", async ({ page }) => {
  await open(page, "modules");
  const read = await page.evaluate(() => {
    const { FlexboxLayout, Flexed, make } = window.objects;
    const said = (work) => {
      try {
        work();
      } catch (error) {
        return error.message;
      }
    };
    // QML of the module itself may be of such a type: it is there before
    // the QML is.
    return [typeof FlexboxLayout, said(() => make(FlexboxLayout)), said(() => FlexboxLayout.Wrap), said(() => make(Flexed))];
  });
  const message = "QtQuick.Layouts: FlexboxLayout is not in ljos-web yet";
  expect(read).toEqual(["function", message, message, message]);
});

test("QML of Qt's own in a module Qt has not installed is there to be named, and says so when it is used", async ({ page }) => {
  await open(page, "modules");
  const read = await page.evaluate(() => {
    const { LightmapperOutputWindow, make } = window.objects;
    try {
      make(LightmapperOutputWindow);
    } catch (error) {
      return [typeof LightmapperOutputWindow, error.message];
    }
  });
  // `tests/qt` has Qt Quick 3D's helpers and not Qt Quick 3D itself.
  expect(read).toEqual(["function", "QtQuick3D: LightmapperOutputWindow is QML of Qt's own, and Qt's QtQuick3D is not installed here"]);
});

test("a picture Qt keeps inside a module is one the build has", async ({ page }) => {
  await open(page, "modules");
  await page.waitForFunction(() => window.objects.shelf.knot.status === 1);
  const read = await page.evaluate(() => {
    const { knot } = window.objects.shelf;
    return [knot.source, knot.implicitWidth, knot.implicitHeight];
  });
  expect(read).toEqual(["qrc:/qt-project.org/imports/QtShelf/Pine/images/knot.png", 40, 20]);
});

test("a file the program keeps inside itself is one the build has", async ({ page }) => {
  await open(page, "kept");
  await page.waitForFunction(() => window.scene.sizes().every(([status]) => status === 1));
  // One that goes with a module, one whose name is put together as the
  // program runs, one the build keeps by itself, and one named by a part of
  // the program that is a project of its own.
  expect(await page.evaluate(() => window.scene.sizes())).toEqual([
    [1, 40, 20],
    [1, 60, 30],
    [1, 50, 50],
    [1, 90, 60],
  ]);
  // What the program named them by is what it still reads.
  expect(await page.evaluate(() => window.scene.names())).toEqual([
    "qrc:/qt/qml/Kept/flag.png",
    "qrc:/qt/qml/Kept/marks/disc.svg",
    "qrc:/pictures/alone.png",
    "qrc:/qt/qml/Kept/marks/mark.svg",
  ]);
  // Another of the files that start as the name does is there to be named.
  await page.evaluate(() => (window.scene.mark = "mark"));
  await page.waitForFunction(() => window.scene.sizes()[1][1] !== 60 && window.scene.sizes()[1][0] === 1);
  expect(await page.evaluate(() => window.scene.sizes()[1])).toEqual([1, 90, 60]);
});

test("the style of a module is chosen by the file that imports it", async ({ page }) => {
  await open(page, "modules-oak");
  expect(await page.evaluate(() => [window.objects.shelf.width, window.objects.shelf.height])).toEqual([60, 20]);
});

test("QML of Qt's own is of the style of the program that came to it", async ({ page }) => {
  // The module is in the second of the places Qt's modules are in.
  await open(page, "modules-oak-cabinet");
  const read = await page.evaluate(() => {
    const { cabinet, make } = window.objects;
    const shelf = make(cabinet.kind);
    return [shelf.width, shelf.height];
  });
  expect(read).toEqual([60, 20]);
});

test("a picture Qt keeps inside a module is there for another module that names it", async ({ page }) => {
  // Its own module is of a style the program is not of, and is not asked for.
  await open(page, "modules-oak-cabinet");
  await page.waitForFunction(() => window.objects.cabinet.knot.status !== 2);
  const read = await page.evaluate(() => {
    const { knot } = window.objects.cabinet;
    return [knot.status, knot.implicitWidth, knot.implicitHeight];
  });
  expect(read).toEqual([1, 40, 20]);
});

test("a file beside the program as it runs is where the program says", async ({ page }) => {
  await open(page, "beside");
  await page.waitForFunction(() => window.scene.sizes().every(([status]) => status === 1));
  expect(await page.evaluate(() => window.scene.sizes())).toEqual([
    [1, 40, 20],
    [1, 90, 60],
    [1, 50, 50],
  ]);
  expect(await page.evaluate(() => window.scene.names())).toEqual(["file:store/flag.png", "file:store/marks/mark.svg", "file:store/deep/alone.png"]);
  // What is beside nothing the program told of, or says from where, is as it was.
  expect(await page.evaluate(() => window.objects.elsewhere)).toEqual(["file:other/flag.png", "file:/store/flag.png", "store/flag.png"]);
});
