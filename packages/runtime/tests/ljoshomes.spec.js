// What Qt's `Qt` object held, under the names Ljós's API gives it (ljos-ui's
// `features/language/no-qt-global.feature`, "The same file in Ljós's API
// has them from Ljos.Core and Ljos.Ui"): a file of that API has no `Qt`.
import { expect, open, test } from "./open.js";

test("colours, fonts, a binding, the application, a locale and enum keys come from Ljos.Core and Ljos.Ui", async ({ page }) => {
  await open(page, "ljoshomes");
  const answers = await page.evaluate(async () => {
    const { core, ui, base, twice } = window.objects;
    const { App, Color, Locale, bind, matrix4x4, rgba } = core;
    const { Align, Font, Key, Modifier, MouseButton } = ui;
    const c = rgba(0.8, 0.4, 0.2, 1);
    twice.width = bind(() => base.width * 2);
    base.width = 4;
    window.flush();
    const before = App.language;
    App.language = "is_IS";
    return {
      dark: `${Color.of(c).darker(2)}`,
      same: Color.of("red").equals("#ff0000"),
      px: Font.of({ family: "Sans", pixelSize: 20 }).pixelSize,
      listed: Array.isArray(Font.families()),
      m11: matrix4x4(2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1).m11,
      day: Locale.current.formatDate("2020-01-02T12:00", "yyyy-MM-dd"),
      german: Locale.named("de_DE").name,
      hinted: App.hints.mousePressAndHoldInterval > 0,
      typing: App.inputMethod.visible,
      corner: Align.Left | Align.Top,
      digit: Key.Digit0,
      button: MouseButton.Left,
      control: Modifier.Control,
      twice: twice.width,
      changed: before !== App.language,
      language: App.language,
      qt: "Qt" in core || "Qt" in ui,
    };
  });
  expect(answers).toEqual({
    dark: "#66331a",
    same: true,
    px: 20,
    listed: true,
    m11: 2,
    day: "2020-01-02",
    german: "de_DE",
    hinted: true,
    typing: false,
    corner: 33,
    digit: 48,
    button: 1,
    control: 67108864,
    twice: 8,
    changed: true,
    language: "is_IS",
    qt: false,
  });
});

test.describe("App.exit", () => {
  test.use({ told: [/App\.exit\(3\): the code does not reach the process yet/] });

  test("with a code other than 0 says the code does not reach the process", async ({ page }) => {
    const warnings = [];
    page.on("console", (message) => message.type() === "warning" && warnings.push(message.text()));
    await open(page, "ljoshomes");
    await page.evaluate(() => window.objects.core.App.exit(3));
    expect(warnings).toEqual([expect.stringMatching(/App\.exit\(3\): the code does not reach the process yet/)]);
  });
});

test("the application's own names read and write through App", async ({ page }) => {
  await open(page, "ljoshomes");
  expect(
    await page.evaluate(() => {
      const { App } = window.objects.core;
      App.name = "Almanac";
      return [App.name, typeof App.quit, Array.isArray(App.arguments), typeof App.platform.os];
    }),
  ).toEqual(["Almanac", "function", true, "string"]);
});

test("Locale has its formats and enums beside current and named", async ({ page }) => {
  await open(page, "ljoshomes");
  expect(
    await page.evaluate(() => {
      const { App, Locale } = window.objects.core;
      App.language = "de_DE";
      return [Locale.Format.Short, Locale.ShortFormat, Locale.current.name, typeof Locale.current.formatTime];
    }),
  ).toEqual([1, 1, "de_DE", "function"]);
});
