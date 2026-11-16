// What is expected here is what Qt 6.11 answers for the same QML (`qml6`).
import { expect, open, test } from "./open.js";

const channels = (page, name) =>
  page.evaluate((name) => {
    const c = window.objects[name].color;
    return [String(c), c.r, c.g, c.b, c.a, c.hsvHue, c.hsvSaturation, c.hsvValue, c.hslHue, c.hslSaturation, c.hslLightness, c.valid];
  }, name);

const painted = (page, name) =>
  page.evaluate((name) => getComputedStyle(window.objects[name].$node).backgroundColor, name);

test("a colour reads back as a value with Qt's channels", async ({ page }) => {
  await open(page, "color");
  expect(await channels(page, "named")).toEqual([
    "#4682b4", 0.27450981736183167, 0.5098039507865906, 0.7058823704719543, 1,
    0.5757499933242798, 0.6111085414886475, 0.7058823704719543,
    0.5757499933242798, 0.43999388813972473, 0.4901960790157318, true,
  ]);
  expect(await channels(page, "made")).toEqual(["#80ff0000", 1, 0, 0, 0.5000076293945312, 0, 1, 1, 0, 1, 0.5000076293945312, true]);
  expect(await channels(page, "lit")).toEqual([
    "#72bfff", 0.4477149546146393, 0.7489891052246094, 1, 1,
    0.5757499933242798, 0.5522850155830383, 1,
    0.5757499933242798, 1, 0.7238574624061584, true,
  ]);
  // Twelve hexadecimal digits: sixteen bits a channel.
  expect(await channels(page, "long")).toEqual([
    "#112233", 0.06666667014360428, 0.13333334028720856, 0.20000000298023224, 1,
    0.5833333134651184, 0.6666666865348816, 0.20000000298023224,
    0.5833333134651184, 0.5000076293945312, 0.13333334028720856, true,
  ]);
  expect(await channels(page, "clear")).toEqual(["#00000000", 0, 0, 0, 0, -1, 0, 0, -1, 0, 0, true]);
  expect(await channels(page, "hsl")).toEqual([
    "#335c99", 0.20000000298023224, 0.36000609397888184, 0.6000000238418579, 1,
    0.6000000238418579, 0.6666666865348816, 0.6000000238418579,
    0.6000000238418579, 0.5000076293945312, 0.4000000059604645, true,
  ]);
});

test("lighter, darker, alpha and tint give Qt's colours", async ({ page }) => {
  await open(page, "color");
  const made = await page.evaluate(() => {
    const { Qt, named } = window.objects;
    return [
      Qt.darker(named.color),
      Qt.darker("steelblue", 1.2),
      Qt.lighter("#102030", 3),
      Qt.alpha("steelblue", 0.25),
      Qt.tint("steelblue", "#80ff0000"),
      Qt.hsva(0.25, 1, 0.5, 0.5),
      named.color.lighter(1.1),
      Qt.hsla(0.6, 0.5, 0.4, 1),
      Qt.color("Light Blue"),
      Qt.color("#abc"),
      Qt.lighter(Qt.hsla(0.6, 0.5, 0.4, 1)),
    ].map(String);
  });
  expect(made).toEqual([
    "#23415a", "#3a6c96", "#306090", "#404682b4", "#a3415a", "#80408000",
    "#4d8fc6", "#335c99", "#add8e6", "#aabbcc", "#4d8ae5",
  ]);
});

test("a colour equals its hexadecimal name, and colorEqual knows the others", async ({ page }) => {
  await open(page, "color");
  const equal = await page.evaluate(() => {
    const { Qt, named, made } = window.objects;
    return [
      named.color == "#4682b4",
      named.color == "steelblue",
      made.color == "#80ff0000",
      Qt.colorEqual(named.color, "steelblue"),
      Qt.colorEqual("#ff0000", "red"),
      Qt.colorEqual(Qt.hsla(0, 1, 0.5, 1), "red"),
      Qt.colorEqual("transparent", "#00000000"),
    ];
  });
  expect(equal).toEqual([true, false, true, true, true, false, true]);
});

test("what is no colour is refused as Qt refuses it", async ({ page }) => {
  await open(page, "color");
  const answers = await page.evaluate(() => {
    const { Qt } = window.objects;
    const message = (work) => {
      try {
        return work();
      } catch (error) {
        return error.message;
      }
    };
    return [
      message(() => Qt.color("nonsense")),
      Qt.lighter("nonsense"),
      Qt.alpha("nonsense", 0.5),
      Qt.tint("nonsense", "red"),
      message(() => Qt.colorEqual("nonsense", "red")),
    ];
  });
  expect(answers).toEqual(['"nonsense" is not a valid color name', null, null, null, "Qt.colorEqual(): Invalid color name"]);
});

test("a rectangle is painted with the colour, and what is bound to it follows", async ({ page }) => {
  await open(page, "color");
  expect(await painted(page, "named")).toBe("rgb(70, 130, 180)");
  expect(await painted(page, "made")).toBe("rgba(255, 0, 0, 0.5)");
  expect(await painted(page, "lit")).toBe("rgb(114, 191, 255)");
  expect(await painted(page, "long")).toBe("rgb(17, 34, 51)");
  expect(await painted(page, "clear")).toBe("rgba(0, 0, 0, 0)");
  expect(await painted(page, "hsl")).toBe("rgb(51, 92, 153)");
  expect(await page.evaluate(() => String(window.objects.clear.border.color))).toBe("#80ff0000");

  const read = await page.evaluate(() => {
    const { Qt, named, lit } = window.objects;
    named.color = "red";
    const first = [String(lit.color), String(named.color), named.color.r, lit.color.g];
    named.color = Qt.rgba(0, 0.5, 0, 1);
    return [...first, String(lit.color), String(named.color), named.color == "#008000", named.color.g];
  });
  expect(read).toEqual(["#ff7f7f", "#ff0000", 1, 0.49999237060546875, "#00bf00", "#008000", true, 0.5000076293945312]);
  expect(await painted(page, "named")).toBe("rgb(0, 128, 0)");
  expect(await painted(page, "lit")).toBe("rgb(0, 191, 0)");
});

test("an animation's colours are Qt's, channel by channel", async ({ page }) => {
  await open(page, "color");
  const steps = await page.evaluate(() =>
    [0.1, 0.25, 0.37, 0.5, 0.75, 0.99].map((t) => String(window.objects.mix("#102030", "#80f0e0d1", t))),
  );
  expect(steps).toEqual(["#f2263340", "#df485058", "#d062676b", "#bf808080", "#9fb8b0a8", "#81eddecf"]);
});

const ROLES = ["alternateBase", "base", "brightText", "button", "buttonText", "dark", "highlight", "highlightedText", "light", "link", "linkVisited", "mid", "midlight", "shadow", "text", "toolTipBase", "toolTipText", "window", "windowText", "placeholderText", "accent"];
const SYSTEM = ["window", "windowText", "base", "text", "alternateBase", "button", "buttonText", "light", "midlight", "dark", "mid", "shadow", "highlight", "highlightedText", "placeholderText", "accent"];

const roles = (page, read, names) =>
  page.evaluate(
    ([source, names]) => {
      const palette = new Function("objects", `with (objects) { return ${source}; }`)(window.objects);
      return names.map((role) => `${role}:${palette[role]}`).join(" ");
    },
    [read, names],
  );

test("the system's palette is Qt's own light one", async ({ page }) => {
  await open(page, "palette");
  const active =
    "window:#efefef windowText:#000000 base:#ffffff text:#000000 alternateBase:#f7f7f7 button:#efefef buttonText:#000000 light:#ffffff midlight:#cacaca dark:#9f9f9f mid:#b8b8b8 shadow:#767676 highlight:#308cc6 highlightedText:#ffffff placeholderText:#80000000 accent:#308cc6";
  expect(await roles(page, "active", SYSTEM)).toBe(active);
  expect(await roles(page, "disabled", SYSTEM)).toBe(
    "window:#efefef windowText:#bebebe base:#efefef text:#bebebe alternateBase:#f7f7f7 button:#efefef buttonText:#bebebe light:#ffffff midlight:#cacaca dark:#bebebe mid:#b8b8b8 shadow:#b1b1b1 highlight:#919191 highlightedText:#ffffff placeholderText:#80000000 accent:#919191",
  );
  expect(
    await page.evaluate(() => {
      const { SystemPalette, active, disabled, painted } = window.objects;
      const before = [active.colorGroup, disabled.colorGroup, SystemPalette.Active, SystemPalette.Inactive, SystemPalette.Disabled];
      active.colorGroup = SystemPalette.Disabled;
      const grey = [String(active.highlight), getComputedStyle(painted.$node).backgroundColor];
      active.colorGroup = SystemPalette.Inactive;
      return [...before, ...grey, String(active.highlight), active.highlight.r, getComputedStyle(painted.$node).backgroundColor];
    }),
  ).toEqual([0, 1, 0, 2, 1, "#919191", "rgb(145, 145, 145)", "#308cc6", 0.1882352977991104, "rgb(48, 140, 198)"]);
});

// Qt 6.11 measures no Fusion palette in a dark scheme; Ljós answers
// with Basic's dark one, as ljos-ui's palette does (ljos_quick
// palette.rs), so a palette nobody set follows the reader's scheme and
// what is drawn with it stays readable in both.
test("in a dark scheme a palette nobody set, and the system's, are the dark ones", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await open(page, "palette");
  expect(await roles(page, "plain", ROLES)).toBe(
    "alternateBase:#2b2b2b base:#000000 brightText:#000000 button:#2f2f2f buttonText:#d4d6d8 dark:#c8c9cb highlight:#0d69f2 highlightedText:#fdfdfd light:#1a1a1a link:#2f86b1 linkVisited:#ff00ff mid:#626262 midlight:#2c2c2c shadow:#28282a text:#eff0f2 toolTipBase:#000000 toolTipText:#ffffff window:#000000 windowText:#d4d6d8 placeholderText:#88c8c9cb accent:#308cc6",
  );
  expect(await roles(page, "plain.disabled", ["base", "buttonText", "highlight", "text", "windowText", "accent"])).toBe(
    "base:#292929 buttonText:#4dd4d6d8 highlight:#01060f text:#7fc8c9cb windowText:#3f4040 accent:#919191",
  );
  expect(await roles(page, "active", ["window", "windowText", "base", "text"])).toBe("window:#000000 windowText:#d4d6d8 base:#000000 text:#eff0f2");
  // A role somebody set is theirs in either scheme.
  expect(await roles(page, "tinted", ["button", "text"])).toBe("button:#ff0000 text:#eff0f2");
  // And it changes as the scheme does.
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => roles(page, "plain", ["window", "windowText"])).toBe("window:#efefef windowText:#000000");
});

test("a palette has Qt's colours in three groups, and a role set on it is set in all", async ({ page }) => {
  await open(page, "palette");
  const active =
    "alternateBase:#f7f7f7 base:#ffffff brightText:#ffffff button:#efefef buttonText:#000000 dark:#9f9f9f highlight:#308cc6 highlightedText:#ffffff light:#ffffff link:#0000ff linkVisited:#ff00ff mid:#b8b8b8 midlight:#cacaca shadow:#767676 text:#000000 toolTipBase:#ffffdc toolTipText:#000000 window:#efefef windowText:#000000 placeholderText:#80000000 accent:#308cc6";
  const disabled =
    "alternateBase:#f7f7f7 base:#efefef brightText:#ffffff button:#efefef buttonText:#bebebe dark:#bebebe highlight:#919191 highlightedText:#ffffff light:#ffffff link:#0000ff linkVisited:#ff00ff mid:#b8b8b8 midlight:#cacaca shadow:#b1b1b1 text:#bebebe toolTipBase:#ffffdc toolTipText:#000000 window:#efefef windowText:#bebebe placeholderText:#80000000 accent:#919191";
  expect(await roles(page, "plain", ROLES)).toBe(active);
  expect(await roles(page, "plain.active", ROLES)).toBe(active);
  expect(await roles(page, "plain.inactive", ROLES)).toBe(active);
  expect(await roles(page, "plain.disabled", ROLES)).toBe(disabled);
  expect(
    await page.evaluate(() => {
      const { tinted, group } = window.objects;
      const read = () =>
        [tinted.button, tinted.active.button, tinted.inactive.button, tinted.disabled.button, tinted.disabled.text, tinted.text, tinted.active.text].join();
      const before = read();
      tinted.button = "#010203";
      tinted.active.text = "white";
      return [before, read(), String(group.window), String(group.base), tinted.button.b];
    }),
  ).toEqual([
    "#ff0000,#ff0000,#ff0000,#ff0000,#0000ff,#000000,#000000",
    "#010203,#010203,#010203,#010203,#0000ff,#ffffff,#ffffff",
    "#123456",
    "#ffffff",
    0.0117647061124444,
  ]);
});

test("a palette that follows another answers with its colours, for the group in use", async ({ page }) => {
  await open(page, "palette");
  const read = () =>
    page.evaluate(() => {
      const { follower } = window.objects;
      return [follower.button, follower.disabled.text, follower.text, follower.active.text, follower.window, follower.disabled.window, follower.base].join();
    });
  // What Qt answers for an item inside one with `palette.button: "red"` and
  // `palette.disabled.text: "blue"`, enabled and then not.
  expect(await read()).toBe("#ff0000,#0000ff,#000000,#000000,#00ff00,#00ff00,#ffffff");
  await page.evaluate(() => {
    window.objects.setGroup("disabled");
    window.flush();
  });
  expect(await read()).toBe("#ff0000,#0000ff,#0000ff,#000000,#00ff00,#00ff00,#efefef");
});
