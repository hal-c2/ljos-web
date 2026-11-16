// Translated messages, written as tagged templates (`` t`Hello ${name}` ``)
// and compiled in the page: ljos-ui's features/i18n/messages.feature,
// scenario by scenario. The catalogue is the feature's `is.po`; the UI
// language is `App.language`, which a binding showing a message follows.
import { expect, test } from "./open.js";

const IS_PO = `msgid ""
msgstr ""
"Language: is\\n"

msgid "Open"
msgstr "Opna"

msgid "Hello {name}"
msgstr "Halló {name}"

msgid "{count, plural, one {# file} other {# files}}"
msgstr "{count, plural, one {# skrá} other {# skrár}}"

msgid "{role, select, admin {Administrator} other {Member}}"
msgstr "{role, select, admin {Stjórnandi} other {Meðlimur}}"

msgctxt "menu"
msgid "Open"
msgstr "Opna valmynd"

msgid "nav.home"
msgstr "Heim"

msgid "Goodbye {name}"
msgstr "Bless {nme}"
`;

// A file of Ljós's API whose root has `properties`, each a line of QML.
const qml = (...lines) => `import Ljos.Ui\nimport Ljos.Core\nItem {\n${lines.map((line) => `  ${line}\n`).join("")}}\n`;

// Compiles `files` in the page with `is.po` installed, and mounts
// `Main.qml`.
async function shown(page, files) {
  await page.goto("/compiler.html");
  await page.waitForFunction(() => window.ready);
  await page.evaluate((po) => window.messages.installCatalog(po, "is.po"), IS_PO);
  const made = await page.evaluate((request) => window.show(request), { files, entry: "Main.qml" });
  expect(made).toMatchObject({ mounted: true });
}

const language = (page, name) =>
  page.evaluate((name) => {
    window.messages.App.language = name;
    window.flush();
  }, name);
const read = (page, name) => page.evaluate((name) => window.scene[name], name);
const write = (page, name, value) =>
  page.evaluate(([name, value]) => {
    window.scene[name] = value;
    window.flush();
  }, [name, value]);

test.describe("a message is its source text until the UI language has it", () => {
  test("a message follows the UI language", async ({ page }) => {
    await shown(page, { "Main.qml": qml("property string open: t`Open`") });
    expect(await read(page, "open")).toBe("Open");
    await language(page, "is");
    expect(await read(page, "open")).toBe("Opna");
    await language(page, "");
    expect(await read(page, "open")).toBe("Open");
  });

  test("a more specific language finds the catalogue of a less specific one", async ({ page }) => {
    await shown(page, { "Main.qml": qml("property string open: t`Open`") });
    await language(page, "is-IS");
    expect(await read(page, "open")).toBe("Opna");
    await language(page, "is_IS");
    expect(await read(page, "open")).toBe("Opna");
  });

  test("a message the catalogue does not have is shown as written, with its values", async ({ page }) => {
    await shown(page, { "Main.qml": qml("property int left: 4", "property string shown: t`${left} left`") });
    await language(page, "is");
    expect(await read(page, "shown")).toBe("4 left");
  });

  test.describe(() => {
    test.use({ told: [/is\.po:.*Goodbye \{name\}.*\{nme\}/] });
    test("a translation that names a value the message does not have is not used", async ({ page }) => {
      const warnings = [];
      page.on("console", (message) => message.type() === "warning" && warnings.push(message.text()));
      await shown(page, { "Main.qml": qml('property string name: "Ada"', "property string bye: t`Goodbye ${name}`") });
      await language(page, "is");
      expect(await read(page, "bye")).toBe("Goodbye Ada");
      // Said once, however often the binding reads the message.
      expect(warnings).toEqual([
        expect.stringMatching(/^is\.po:\d+: "Goodbye \{name\}": the translation names \{nme\}, which the message does not have$/),
      ]);
    });
  });
});

test.describe("values are placeholders named after them", () => {
  for (const [message, expected] of [
    ["t`Use {braces}`", "Use {braces}"],
    ["t`Don't save`", "Don't save"],
    ["t`'{quoted}'`", "'{quoted}'"],
    [`plural(count, { other: "# in '#'1" })`, "3 in #1"],
    [`plural(count, { other: "# don't fit" })`, "3 don't fit"],
    [`plural(count, { other: "{left} # {right}" })`, "{left} 3 {right}"],
  ]) {
    test(`text written in the message is shown as written: ${message}`, async ({ page }) => {
      await shown(page, { "Main.qml": qml("property int count: 3", `property string shown: ${message}`) });
      expect(await read(page, "shown")).toBe(expected);
    });
  }

  test("a value is shown where the translation puts it, and again when it changes", async ({ page }) => {
    await shown(page, { "Main.qml": qml('property string name: "Ada"', "property string hello: t`Hello ${name}`") });
    await language(page, "is");
    expect(await read(page, "hello")).toBe("Halló Ada");
    await write(page, "name", "Jón");
    expect(await read(page, "hello")).toBe("Halló Jón");
  });
});

test.describe("counts and choices are written in the message", () => {
  for (const [count, english, icelandic] of [
    [1, "1 file", "1 skrá"],
    [3, "3 files", "3 skrár"],
    [21, "21 files", "21 skrá"],
  ]) {
    test(`a count picks the language's plural form: ${count}`, async ({ page }) => {
      await shown(page, {
        "Main.qml": qml(`property int count: ${count}`, 'property string files: plural(count, { one: "# file", other: "# files" })'),
      });
      expect(await read(page, "files")).toBe(english);
      await language(page, "is");
      expect(await read(page, "files")).toBe(icelandic);
    });
  }

  for (const [count, expected] of [
    [0, "No files"],
    [1, "1 file"],
    [2, "2 files"],
  ]) {
    test(`a number form is chosen before the language's forms: ${count}`, async ({ page }) => {
      await shown(page, {
        "Main.qml": qml(
          `property int count: ${count}`,
          'property string files: plural(count, { 0: "No files", one: "# file", other: "# files" })',
        ),
      });
      expect(await read(page, "files")).toBe(expected);
    });
  }

  test("a count is written as the language writes numbers, however the language is named", async ({ page }) => {
    await shown(page, {
      "Main.qml": qml("property int count: 1000", 'property string files: plural(count, { one: "# file", other: "# files" })'),
    });
    // Chromium's ICU has no Icelandic numbers (`is` formats as en-US), so
    // German, which has no catalogue here: the source, in its numbers.
    await language(page, "de_DE");
    expect(await read(page, "files")).toBe("1.000 files");
  });

  test("an ordinal picks the language's ordinal form", async ({ page }) => {
    await shown(page, {
      "Main.qml": qml(
        "property int place: 1",
        'property string shown: selectOrdinal(place, { one: "#st", two: "#nd", few: "#rd", other: "#th" })',
      ),
    });
    const shownFor = [];
    for (const place of [1, 2, 3, 4, 11, 22]) {
      await write(page, "place", place);
      shownFor.push(await read(page, "shown"));
    }
    expect(shownFor).toEqual(["1st", "2nd", "3rd", "4th", "11th", "22nd"]);
  });

  test("a catalogue whose language is named as Qt names it picks plural forms", async ({ page }) => {
    await shown(page, {
      "Main.qml": qml("property int count: 1", 'property string files: plural(count, { one: "# file", other: "# files" })'),
    });
    await page.evaluate(() =>
      window.messages.installCatalog(
        'msgid ""\nmsgstr ""\n"Language: en_US\\n"\n\nmsgid "{count, plural, one {# file} other {# files}}"\nmsgstr "{count, plural, one {# document} other {# documents}}"\n',
        "en_US.po",
      ),
    );
    await language(page, "en_US");
    expect(await read(page, "files")).toBe("1 document");
  });

  test("a choice may have a form named offset", async ({ page }) => {
    await shown(page, {
      "Main.qml": qml('property string mode: "offset"', 'property string shown: select(mode, { offset: "Offset", other: "Other" })'),
    });
    expect(await read(page, "shown")).toBe("Offset");
  });

  test("a choice inside a count's form may have a form named offset", async ({ page }) => {
    await shown(page, {
      "Main.qml": qml(
        "property int n: 2",
        'property string mode: "offset"',
        'property string shown: t`${plural(n, { other: "# files" })} ${mode}`',
      ),
    });
    await page.evaluate(() =>
      window.messages.installCatalog(
        'msgid ""\nmsgstr ""\n"Language: is\\n"\n\nmsgid "{n, plural, other {# files}} {mode}"\nmsgstr "{n, plural, other {{mode, select, offset {# hliðraðar} other {# skrár}}}}"\n',
        "offset.po",
      ),
    );
    await language(page, "is");
    expect(await read(page, "shown")).toBe("2 hliðraðar");
  });

  test("a choice picks a form by its value, and other when none matches", async ({ page }) => {
    await shown(page, {
      "Main.qml": qml('property string role: "admin"', 'property string label: select(role, { admin: "Administrator", other: "Member" })'),
    });
    await language(page, "is");
    expect(await read(page, "label")).toBe("Stjórnandi");
    await write(page, "role", "guest");
    expect(await read(page, "label")).toBe("Meðlimur");
  });

  test("a count inside a sentence is one message", async ({ page }) => {
    await shown(page, {
      "Main.qml": qml(
        'property string name: "Ada"',
        "property int n: 1000",
        'property string shown: t`${name} has ${plural(n, { one: "# file", other: "# files" })}`',
      ),
    });
    expect(await read(page, "shown")).toBe("Ada has 1,000 files");
  });
});

test.describe("a message can say its context and its id", () => {
  test("the same text in another context is another message", async ({ page }) => {
    await shown(page, {
      "Main.qml": qml("property string plain: t`Open`", 'property string menu: t({ message: "Open", context: "menu" })'),
    });
    await language(page, "is");
    expect(await read(page, "plain")).toBe("Opna");
    expect(await read(page, "menu")).toBe("Opna valmynd");
  });

  test("a message with only an id shows its id until a catalogue has it", async ({ page }) => {
    await shown(page, { "Main.qml": qml('property string home: t({ id: "nav.home" })') });
    expect(await read(page, "home")).toBe("nav.home");
    await language(page, "is");
    expect(await read(page, "home")).toBe("Heim");
    await language(page, "de");
    expect(await read(page, "home")).toBe("nav.home");
  });

  test.describe(() => {
    test.use({ told: [/^greet\.po:\d+: "greeting": the translation names \{name\}, which the message does not have$/] });
    test("a translation fits one message of an id and not another", async ({ page }) => {
      // Descriptors made at run time, whose text is already ICU's.
      await shown(page, {
        "greetings.ts":
          'import type { MessageDescriptor } from "@ljos/core"\n' +
          'export const welcome: MessageDescriptor = { id: "greeting", message: "Welcome {user}", values: { user: "Bob" } }\n' +
          'export const hello: MessageDescriptor = { id: "greeting", message: "Hello {name}", values: { name: "Ada" } }\n',
        "Main.qml": qml(
          "property string welcome: t(Greetings.welcome)",
          "property string hello: t(Greetings.hello)",
          "property string again: t(Greetings.welcome)",
        ).replace("import Ljos.Core\n", 'import Ljos.Core\nimport "greetings.ts" as Greetings\n'),
      });
      await page.evaluate(() =>
        window.messages.installCatalog('msgid ""\nmsgstr ""\n"Language: is\\n"\n\nmsgid "greeting"\nmsgstr "Hi {name}"\n', "greet.po"),
      );
      await language(page, "is");
      expect(await read(page, "welcome")).toBe("Welcome Bob");
      expect(await read(page, "hello")).toBe("Hi Ada");
      expect(await read(page, "again")).toBe("Welcome Bob");
    });
  });

  test("a message with an id is found by its id and shows its message until then", async ({ page }) => {
    await shown(page, { "Main.qml": qml('property string home: t({ id: "nav.home", message: "Home" })') });
    expect(await read(page, "home")).toBe("Home");
    await language(page, "is");
    expect(await read(page, "home")).toBe("Heim");
  });
});

test.describe("the application changes the language", () => {
  test("assigning App.language translates what is on screen again", async ({ page }) => {
    await shown(page, {
      "Main.qml": qml("property string open: t`Open`", 'function speakIcelandic() { App.language = "is" }'),
    });
    await page.evaluate(() => {
      window.scene.speakIcelandic();
      window.flush();
    });
    expect(await read(page, "open")).toBe("Opna");
  });
});

test.describe("a delegate's messages", () => {
  test("a message in a delegate shows the model's values and follows the UI language", async ({ page }) => {
    await shown(page, {
      "Main.qml": qml(
        "property var greeting: msg`Open`",
        "Repeater {",
        '  model: [{ name: "Ada", count: 1 }, { name: "Grace", count: 2 }]',
        "  delegate: Item {",
        "    property string name: modelData.name",
        "    property int count: modelData.count",
        "    Text { text: t`Hello ${name}` }",
        '    Text { text: plural(count, { one: "# file", other: "# files" }) }',
        "    Text { text: t(greeting) }",
        "  }",
        "}",
      ),
    });
    await expect(page.getByText("Hello Ada", { exact: true })).toBeVisible();
    await expect(page.getByText("2 files", { exact: true })).toBeVisible();
    await expect(page.getByText("Open", { exact: true })).toHaveCount(2);
    await language(page, "is");
    await expect(page.getByText("Halló Ada", { exact: true })).toBeVisible();
    await expect(page.getByText("Halló Grace", { exact: true })).toBeVisible();
    await expect(page.getByText("1 skrá", { exact: true })).toBeVisible();
    await expect(page.getByText("2 skrár", { exact: true })).toBeVisible();
    await expect(page.getByText("Opna", { exact: true })).toHaveCount(2);
  });
});

test.describe("messages live in modules too", () => {
  test("a module's function translates when a binding calls it", async ({ page }) => {
    await shown(page, {
      "greet.ts": 'import { t } from "@ljos/core"\nexport function hello(name: string): string {\n  return t`Hello ${name}`\n}\n',
      "Main.qml": 'import Ljos.Ui\nimport "greet.ts" as Greet\nItem {\n  property string hello: Greet.hello("Ada")\n}\n',
    });
    await language(page, "is");
    expect(await read(page, "hello")).toBe("Halló Ada");
  });

  test("a message marked with msg is translated where it is shown", async ({ page }) => {
    await shown(page, {
      "menu.ts":
        'import { msg, type MessageDescriptor } from "@ljos/core"\nexport const items: readonly [MessageDescriptor, MessageDescriptor] =\n  [msg`Open`, msg({ id: "nav.home", message: "Home" })]\n',
      "Main.qml": qml("property string first: t(Menu.items[0])", "property string second: t(Menu.items[1])").replace(
        "import Ljos.Core\n",
        'import Ljos.Core\nimport "menu.ts" as Menu\n',
      ),
    });
    expect(await read(page, "first")).toBe("Open");
    await language(page, "is");
    expect(await read(page, "first")).toBe("Opna");
    expect(await read(page, "second")).toBe("Heim");
  });
});

// The `qsTr` family keeps what it did: a string is its own translation,
// whatever catalogue is installed.
test("qsTr is unchanged by the catalogues of t", async ({ page }) => {
  await shown(page, { "Main.qml": 'import QtQuick\nItem {\n  property string open: qsTr("Open")\n}\n' });
  await language(page, "is");
  expect(await read(page, "open")).toBe("Open");
});
