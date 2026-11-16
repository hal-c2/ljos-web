// What is expected of a Window's properties here is what Qt 6.11 answers for
// the same QML (`qml6`); where it is on the page is this runtime's own.
import { expect, open, test } from "./open.js";

// What each thunk returns, with the scene's objects in scope.
const answers = (page, work) =>
  page.evaluate(
    (source) =>
      new Function("objects", `with (objects) { return (${source})(); }`)(window.objects).map((each) => {
        try {
          return each();
        } catch (error) {
          return `THROW ${error.message}`;
        }
      }),
    work.toString(),
  );

// Where a window is on the page, and whether it shows.
const layer = (page, name) =>
  page.evaluate((name) => {
    const element = window.objects[name].$element;
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height, shown: getComputedStyle(element).visibility === "visible" };
  }, name);

test("a window's items are its content item's, and the rest only lives", async ({ page }) => {
  await open(page, "window");
  expect(
    await answers(page, () => [
      () => child.parent === win.contentItem,
      () => child.parent === win,
      () => grand.parent === child,
      () => win.contentItem.parent,
      () => win.contentItem.children.length,
      () => win.contentItem.children[1] === second,
      () => win.data.length,
      () => win.data[1] === obj,
      () => win.data[3] === nested,
      () => "parent" in win,
      () => nested.transientParent === win,
      () => win.transientParent,
      () => nestedChild.parent === nested.contentItem,
    ]),
  ).toEqual([true, false, true, null, 2, true, 4, true, true, false, true, null, true]);
});

test("a window that is given nothing has Qt's defaults", async ({ page }) => {
  await open(page, "window");
  expect(
    await answers(page, () => {
      const plain = objects.plain();
      return [
        () => plain.visible,
        () => plain.visibility,
        () => String(plain.color),
        () => plain.flags,
        () => plain.modality,
        () => plain.active,
        () => plain.activeFocusItem,
        () => plain.minimumWidth,
        () => plain.minimumHeight,
        () => plain.maximumWidth,
        () => plain.maximumHeight,
        () => plain.opacity,
        () => plain.title,
        () => plain.width,
        () => plain.height,
        () => plain.x,
        () => plain.y,
        () => plain.contentItem.width,
        () => plain.data.length,
        () => plain.screen === Screen.attached(win),
        () => [Window.Hidden, Window.AutomaticVisibility, Window.Windowed, Window.Minimized, Window.Maximized, Window.FullScreen].join(),
        () => [Qt.Window, Qt.NonModal, Qt.ApplicationModal].join(),
      ];
    }),
  ).toEqual([false, 0, "#ffffff", 1, 0, false, null, 0, 0, 16777215, 16777215, 1, "", 0, 0, 0, 0, 0, 0, true, "0,1,2,3,4,5", "1,0,2"]);
});

test("a type derived from Window is a window", async ({ page }) => {
  await open(page, "window");
  expect(
    await answers(page, () => {
      const framed = objects.framed();
      const inner = framed.contentItem.children[0];
      framed.showMaximized();
      return [
        () => framed.width,
        () => framed.header,
        () => framed.contentItem.children.length,
        () => inner.parent === framed.contentItem,
        () => Window.attached(inner).window === framed,
        () => framed.visibility,
        () => framed.$type.typeName,
      ];
    }),
  ).toEqual([50, null, 1, true, true, 4, "Framed"]);
});

test("the root window is the scene: it fills what it is mounted in", async ({ page }) => {
  await open(page, "window");
  expect(await layer(page, "win")).toEqual({ x: 0, y: 0, width: 400, height: 300, shown: true });
  expect(
    await answers(page, () => [
      // Not the 320 by 240 its QML asks for: a window manager's answer.
      () => win.width,
      () => win.height,
      () => win.contentItem.width,
      () => child.width,
      () => child.height,
      () => grand.width,
      () => win.visible,
      () => win.visibility,
      () => document.title,
      () => getComputedStyle(win.$element).backgroundColor,
      () => String(win.color),
      () => win.$element.parentNode.id,
      () => child.$node.parentNode === win.contentItem.$node,
    ]),
  ).toEqual([400, 300, 400, 400, 300, 100, true, 2, "hello", "rgb(70, 130, 180)", "#4682b4", "scene", true]);

  await page.evaluate(() => {
    const scene = document.getElementById("scene");
    scene.style.width = "500px";
    scene.style.height = "200px";
  });
  await page.waitForFunction(() => window.objects.win.width === 500);
  expect(
    await answers(page, () => [
      () => win.height,
      () => child.width,
      () => child.height,
      () => grand.width,
      () => child.$node.getBoundingClientRect().width,
    ]),
  ).toEqual([200, 500, 200, 125, 500]);

  // Asking for a size does not give one, and hiding hides the scene.
  expect(
    await answers(page, () => {
      win.width = 100;
      win.title = "renamed";
      win.color = Qt.rgba(1, 0, 0, 1);
      win.hide();
      return [
        () => win.width,
        () => document.title,
        () => getComputedStyle(win.$element).backgroundColor,
        () => win.visible,
        () => win.visibility,
        () => win.active,
        () => getComputedStyle(win.$element).visibility,
      ];
    }),
  ).toEqual([500, "renamed", "rgb(255, 0, 0)", false, 0, false, "hidden"]);
});

test("a scene can take its window's size instead", async ({ page }) => {
  await open(page, "window");
  await page.evaluate(() => window.objects.mountOwn());
  const host = () =>
    page.evaluate(() => {
      const { width, height } = window.objects.host.getBoundingClientRect();
      const filling = window.objects.filling.$node.getBoundingClientRect();
      return [width, height, filling.width, filling.height, window.objects.own.width, window.objects.own.height];
    });
  expect(await host()).toEqual([320, 240, 320, 240, 320, 240]);
  // Until it is mounted a window has the size it was given, either way.
  expect(await page.evaluate(() => window.objects.log)).toEqual(["own 320x240"]);

  await page.evaluate(() => {
    window.objects.own.minimumWidth = 400;
    window.objects.own.maximumHeight = 100;
  });
  expect(await host()).toEqual([400, 100, 400, 100, 400, 100]);
  await page.evaluate(() => {
    window.objects.own.minimumWidth = 0;
    window.objects.own.width = 250;
  });
  expect(await host()).toEqual([250, 100, 250, 100, 250, 100]);
});

test("a window inside another floats over the scene, shown as it is asked to be", async ({ page }) => {
  await open(page, "window");
  expect(await layer(page, "nested")).toEqual({ x: 20, y: 30, width: 100, height: 80, shown: false });
  const steps = await answers(page, () => {
    const now = () => [nested.visible, nested.visibility, nested.width, nested.height].join();
    const after = (work) => () => {
      work();
      return now();
    };
    return [
      now,
      after(() => (nested.visible = true)),
      after(() => nested.showMaximized()),
      after(() => nested.showFullScreen()),
      after(() => nested.showNormal()),
      after(() => nested.showMinimized()),
      after(() => nested.hide()),
      // Shown again, it is shown as it last was.
      after(() => (nested.visible = true)),
      after(() => nested.show()),
      after(() => nested.hide()),
      after(() => (nested.visibility = Window.Maximized)),
      after(() => (nested.visibility = Window.Hidden)),
      after(() => (nested.visibility = Window.AutomaticVisibility)),
      after(() => nested.show()),
    ];
  });
  expect(steps).toEqual([
    "false,0,100,80",
    "true,2,100,80",
    "true,4,400,300",
    "true,5,400,300",
    "true,2,100,80",
    "true,3,100,80",
    "false,0,100,80",
    "true,3,100,80",
    "true,2,100,80",
    "false,0,100,80",
    "true,4,400,300",
    "false,0,400,300",
    "false,0,400,300",
    "true,2,100,80",
  ]);
  expect(await layer(page, "nested")).toEqual({ x: 20, y: 30, width: 100, height: 80, shown: true });
  expect(
    await answers(page, () => [
      () => getComputedStyle(nested.$element).backgroundColor,
      () => nestedChild.width,
      () => nestedChild.$node.getBoundingClientRect().x,
      // Over the scene's own items.
      () => document.elementFromPoint(25, 35) === nestedChild.$node,
      () => log.join(),
    ]),
  ).toEqual(["rgb(255, 0, 0)", 100, 20, true, "visibility 2,visibility 4,visibility 5,visibility 2,visibility 3,visibility 0,visibility 3,visibility 2,visibility 0,visibility 4,visibility 0,visibility 2"]);

  await page.evaluate(() => {
    window.objects.nested.x = 50;
    window.objects.nested.showMaximized();
  });
  expect(await layer(page, "nested")).toEqual({ x: 0, y: 0, width: 400, height: 300, shown: true });
  await page.evaluate(() => window.objects.nested.showMinimized());
  expect(await layer(page, "nested")).toMatchObject({ shown: false });
  await page.evaluate(() => window.objects.nested.showNormal());
  expect(await layer(page, "nested")).toEqual({ x: 50, y: 30, width: 100, height: 80, shown: true });
  // A floating window shows over a hidden one, as in Qt.
  await page.evaluate(() => window.objects.win.hide());
  expect(await layer(page, "nested")).toMatchObject({ shown: true });
  expect(await layer(page, "win")).toMatchObject({ shown: false });
});

test("closing asks first", async ({ page }) => {
  await open(page, "window");
  expect(
    await answers(page, () => {
      const heard = [];
      nested.closing.connect((close) => heard.push(close.accepted));
      nested.show();
      log.length = 0;
      nested.stay = true;
      return [
        () => nested.close(),
        () => nested.visible,
        () => (nested.stay = false),
        () => nested.close(),
        () => nested.visible,
        () => log.join(),
        // The handler the window was given hears first.
        () => heard.join(),
      ];
    }),
  ).toEqual([false, true, false, true, false, "closing true,closing true,visibility 0", "false,true"]);
});

test("Window attached says which window an item is in", async ({ page }) => {
  await open(page, "window");
  expect(
    await answers(page, () => {
      const of = (object) => Window.attached(object);
      return [
        () => of(child).window === win,
        () => of(grand).window === win,
        () => of(nestedChild).window === nested,
        () => of(child).width,
        () => of(child).height,
        () => of(child).contentItem === win.contentItem,
        () => of(child).visibility,
        () => of(child).active === win.active,
        () => of(child).activeFocusItem,
        () => of(nestedChild).width,
        () => of(nestedChild).visibility,
        // Only an item is in a window.
        () => of(obj).window,
        () => of(win).window,
        () => of(child) === of(child),
        () => win.active === Application.active,
        () => nested.active,
      ];
    }),
  ).toEqual([true, true, true, 400, 300, true, 2, true, null, 100, 0, null, null, true, true, false]);
});

test("the screen is the browser's", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await open(page, "window");
  expect(
    await answers(page, () => {
      const screen = Screen.attached(grand);
      return [
        () => screen.width === window.screen.width,
        () => screen.height === window.screen.height,
        () => screen.desktopAvailableWidth === window.screen.availWidth,
        () => screen.desktopAvailableHeight === window.screen.availHeight,
        () => Screen.width === screen.width,
        () => win.screen === screen,
        () => grand.height === window.screen.height / 10,
        () => screen.devicePixelRatio,
        () => screen.pixelDensity,
        () => screen.logicalPixelDensity,
        () => screen.name,
        () => screen.virtualX,
        () => screen.orientation,
        () => screen.primaryOrientation,
        () => screen.primaryOrientation === Qt.LandscapeOrientation,
        () => screen.angleBetween(Qt.PortraitOrientation, Qt.LandscapeOrientation),
        () => screen.angleBetween(Qt.LandscapeOrientation, Qt.PortraitOrientation),
        () => screen.angleBetween(Qt.PrimaryOrientation, Qt.InvertedLandscapeOrientation),
        () => Screen.angleBetween(Qt.PortraitOrientation, Qt.PortraitOrientation),
        () => [Screen.points(12), screen.points(9), screen.points(10.5), screen.points(0), screen.points(10)],
      ];
    }),
  ).toEqual([true, true, true, true, true, true, true, 1, 3.7795275590551185, 3.7795275590551185, "", 0, 2, 2, true, 270, 90, 180, 0, [16, 12, 14, 0, 13.333333333333334]]);
});

test("an item hears of the screen turning", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await open(page, "window");
  expect(await page.evaluate(() => window.objects.Screen.attached(window.objects.second).primaryOrientation)).toBe(2);
  await page.setViewportSize({ width: 600, height: 900 });
  await page.waitForFunction(() => window.objects.Screen.primaryOrientation === 1);
  expect(await page.evaluate(() => window.objects.log)).toEqual(["turned 1"]);
});

test("an item that is mounted is in a view as big as what it is mounted in", async ({ page }) => {
  await open(page, "viewed");
  const answers = () => page.evaluate(() => window.scene.answers());
  expect(await answers()).toEqual([400, 300, true, 400, 300, 380, 280]);
  const box = () =>
    page.evaluate(() => {
      const { width, height } = window.scene.$node.getBoundingClientRect();
      return [width, height];
    });
  expect(await box()).toEqual([400, 300]);
  // The view is another size when the element is.
  await page.evaluate(() => {
    const stage = document.getElementById("scene");
    stage.style.width = "320px";
    stage.style.height = "200px";
  });
  await expect.poll(answers).toEqual([320, 200, true, 320, 200, 300, 180]);
  expect(await box()).toEqual([320, 200]);
});
