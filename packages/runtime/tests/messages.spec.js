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

// The languages a site is read in: plural forms each language has, a
// catalogue fetched when its language is first asked for, what a
// catalogue lacks said rather than read past, and the direction the
// language is written in.
const po = (language, entries) =>
  `msgid ""\nmsgstr ""\n"Language: ${language}\\n"\n\n${entries.map(([id, str]) => `msgid ${JSON.stringify(id)}\nmsgstr ${JSON.stringify(str)}\n`).join("\n")}`;
const FILES = "{count, plural, one {# file} other {# files}}";
const RU_PO = po("ru", [[FILES, "{count, plural, one {# файл} few {# файла} many {# файлов} other {# файла}}"]]);
const AR_PO = po("ar", [[FILES, "{count, plural, zero {لا ملفات} one {ملف واحد} two {ملفان} few {# ملفات} many {# ملفًا} other {# ملف}}"]]);
const DE_PO = po("de", [["Open", "Öffnen"]]);
const ZH_PO = po("zh-Hans", [["Open", "打开"]]);

test.describe("a site in many languages", () => {
  for (const [tag, catalogue, counts] of [
    ["ru", RU_PO, [[1, "1 файл"], [3, "3 файла"], [5, "5 файлов"], [21, "21 файл"], [1.5, "1,5 файла"]]],
    ["ar", AR_PO, [[0, "لا ملفات"], [1, "ملف واحد"], [2, "ملفان"], [3, "3 ملفات"], [11, "11 ملفًا"], [100, "100 ملف"]]],
  ]) {
    for (const [count, expected] of counts) {
      test(`a count picks ${tag}'s plural form: ${count}`, async ({ page }) => {
        await shown(page, {
          "Main.qml": qml(`property real count: ${count}`, 'property string files: plural(count, { one: "# file", other: "# files" })'),
        });
        await page.evaluate(([text, file]) => window.messages.installCatalog(text, file), [catalogue, `${tag}.po`]);
        await language(page, tag);
        expect(await read(page, "files")).toBe(expected);
      });
    }
  }

  test("a message a language's catalogue lacks is shown as written and reported", async ({ page }) => {
    await shown(page, { "Main.qml": qml("property int left: 4", "property string shown: t`${left} left`", "property string open: t`Open`") });
    await language(page, "is");
    expect(await read(page, "shown")).toBe("4 left");
    expect(await read(page, "open")).toBe("Opna");
    expect(await page.evaluate(() => window.messages.untranslated())).toEqual([{ language: "is", context: "", key: "{left} left" }]);
    // The source language has no catalogue, so nothing is missing in it.
    await language(page, "en");
    expect(await page.evaluate(() => window.messages.untranslated())).toHaveLength(1);
  });

  test("a catalogue is fetched when its language is first asked for, and the page follows", async ({ page }) => {
    const fetched = [];
    await page.route("**/i18n/*.po", (route) => {
      fetched.push(new URL(route.request().url()).pathname);
      return route.fulfill({ body: DE_PO, contentType: "text/x-gettext-translation" });
    });
    await shown(page, { "Main.qml": qml("property string open: t`Open`") });
    await page.evaluate(() => window.messages.catalogSources({ de: "/i18n/de.po", fr: "/i18n/fr.po" }));
    expect(fetched).toEqual([]);
    await language(page, "de");
    await expect.poll(() => page.evaluate(() => (window.flush(), window.scene.open))).toBe("Öffnen");
    expect(fetched).toEqual(["/i18n/de.po"]);
    // Asked for again, it is not fetched again.
    await language(page, "en");
    await language(page, "de-AT");
    expect(await read(page, "open")).toBe("Öffnen");
    expect(fetched).toEqual(["/i18n/de.po"]);
  });

  test("a catalogue loaded before the language is set is there at once", async ({ page }) => {
    await page.route("**/i18n/de.po", (route) => route.fulfill({ body: DE_PO }));
    await shown(page, { "Main.qml": qml("property string open: t`Open`") });
    await page.evaluate(async () => {
      window.messages.catalogSources({ de: "/i18n/de.po" });
      await window.messages.loadCatalogs("de");
    });
    await language(page, "de");
    expect(await read(page, "open")).toBe("Öffnen");
  });

  test.describe(() => {
    test.use({ told: [/de\.po: the catalogue could not be fetched: 404|Failed to load resource/] });
    test("a catalogue that cannot be fetched leaves the source text and is said", async ({ page }) => {
      await page.route("**/i18n/de.po", (route) => route.fulfill({ status: 404, body: "" }));
      await shown(page, { "Main.qml": qml("property string open: t`Open`") });
      await page.evaluate(async () => {
        window.messages.catalogSources({ de: "/i18n/de.po" });
        await window.messages.loadCatalogs("de");
      });
      await language(page, "de");
      expect(await read(page, "open")).toBe("Open");
    });
  });

  test.describe(() => {
    test.use({ told: [/de\.po: the catalogue does not read, so it is left out/] });
    test("a catalogue that does not read is asked for again once it is mended", async ({ page }) => {
      let body = 'msgid "Open"\nmsgstr "Öffnen\n';
      await page.route("**/i18n/de.po", (route) => route.fulfill({ body }));
      await shown(page, { "Main.qml": qml("property string open: t`Open`") });
      await page.evaluate(async () => {
        window.messages.catalogSources({ de: "/i18n/de.po" });
        await window.messages.loadCatalogs("de");
      });
      await language(page, "de");
      expect(await read(page, "open")).toBe("Open");
      body = DE_PO;
      await page.evaluate(() => window.messages.loadCatalogs("de"));
      expect(await read(page, "open")).toBe("Öffnen");
    });
  });

  for (const tag of ["zh-CN", "zh-SG", "zh-Hans", "zh"]) {
    test(`${tag} finds a zh-Hans catalogue`, async ({ page }) => {
      await shown(page, { "Main.qml": qml("property string open: t`Open`") });
      await page.evaluate((text) => window.messages.installCatalog(text, "zh-Hans.po"), ZH_PO);
      await language(page, tag);
      expect(await read(page, "open")).toBe("打开");
    });
  }

  test("zh-TW does not take a zh-Hans catalogue", async ({ page }) => {
    await shown(page, { "Main.qml": qml("property string open: t`Open`") });
    await page.evaluate((text) => window.messages.installCatalog(text, "zh-Hans.po"), ZH_PO);
    await language(page, "zh-TW");
    expect(await read(page, "open")).toBe("Open");
  });

  test("a catalogue is checked against its messages with the parser that reads it", async ({ page }) => {
    await shown(page, { "Main.qml": "import QtQuick\nItem {}\n" });
    const po = (language, entries) =>
      `msgid ""\nmsgstr ""\n"Language: ${language}\\n"\n` + entries.map(([id, str]) => `\nmsgid ${JSON.stringify(id)}\nmsgstr ${JSON.stringify(str)}\n`).join("");
    const check = (text, file) => page.evaluate(([t, f]) => window.messages.checkCatalog(t, f), [text, file]);
    const files = "{0, plural, one {# file} other {# files}}";
    expect(await check(po("ru", [[files, "{0, plural, one {# файл} few {# файла} many {# файлов} other {# файла}}"], ["Hi {name}", "Привет, {name}"]]), "ru.po")).toEqual([]);
    const problems = await check(
      po("ru", [
        [files, "{0, plural, one {# файл} other {# файлов}}"],
        ["Hi {name}", "Привет, {nom}"],
        ["Open {0}", "Открыть {0"],
      ]),
      "ru.po",
    );
    expect(problems).toEqual([
      expect.stringMatching(/^ru\.po:\d+: .*: the count \{0\} needs the form\(s\) few, many in ru$/u),
      expect.stringMatching(/^ru\.po:\d+: "Hi \{name\}": the translation names \{nom\}, which the message does not have$/u),
      expect.stringMatching(/^ru\.po:\d+: "Hi \{name\}": the translation leaves out \{name\}$/u),
      expect.stringMatching(/^ru\.po:\d+: "Open \{0\}": the translation does not parse: /u),
    ]);
    expect(await check(po("ja", [[files, "{0, plural, one {# ファイル} other {# ファイル}}"]]), "ja.po")).toEqual([
      expect.stringMatching(/the count \{0\} has the form\(s\) one, which ja does not use$/u),
    ]);
    // An id is not its message: what the message names is not known, so
    // only how the translation reads is checked.
    const ided = (id, str) => `msgid ""\nmsgstr ""\n"Language: fr\\n"\n\n#. js-lingui-explicit-id\nmsgid ${JSON.stringify(id)}\nmsgstr ${JSON.stringify(str)}\n`;
    expect(await check(ided("greeting", "Bonjour {name}"), "fr.po")).toEqual([]);
    expect(await check(ided("files", "{0, plural, one {# fichier} other {# fichiers}}"), "fr.po")).toEqual([expect.stringMatching(/the count \{0\} needs the form\(s\) many in fr$/u)]);
  });

  // A text with letters of the UI's direction is the UI's own and runs its
  // way, though it starts with a name written the other way; one with
  // none runs the way it is written.
  test("a text runs the way it is written, or the UI's way where it is the UI's", async ({ page }) => {
    await shown(page, {
      "Main.qml": 'import QtQuick\nColumn {\n  Text { text: "Katrín S." }\n  Text { text: "ملف واحد." }\n  Text { text: "Ljós هي حزمة." }\n}\n',
    });
    await language(page, "ar");
    await page.evaluate(() => (document.documentElement.dir = "rtl"));
    // Where the text's last letter is set against its first: right of it
    // in a text read from the left, left of it in one read from the right.
    const ends = (text) =>
      page.evaluate((wanted) => {
        const node = [...document.querySelectorAll(".qq-text")].find((it) => it.textContent === wanted);
        const at = (n) => {
          const range = document.createRange();
          const text = node.firstChild.nodeType === 3 ? node.firstChild : node.querySelector("*").firstChild;
          range.setStart(text, n);
          range.setEnd(text, n + 1);
          return range.getBoundingClientRect().x;
        };
        return Math.sign(at(wanted.length - 1) - at(0));
      }, text);
    expect(await ends("Katrín S.")).toBe(1);
    expect(await ends("ملف واحد.")).toBe(-1);
    expect(await ends("Ljós هي حزمة.")).toBe(-1);
    await language(page, "en");
    await page.evaluate(() => (document.documentElement.dir = "ltr"));
    expect(await ends("Ljós هي حزمة.")).toBe(1);
    expect(await ends("ملف واحد.")).toBe(-1);
  });

  test("the layout direction follows the UI language", async ({ page }) => {
    await shown(page, { "Main.qml": "import QtQuick\nItem {\n  property int direction: Qt.application.layoutDirection\n}\n" });
    await language(page, "en");
    expect(await read(page, "direction")).toBe(0);
    for (const tag of ["ar", "ar-EG", "he", "fa"]) {
      await language(page, tag);
      expect(await read(page, "direction"), tag).toBe(1);
    }
    await language(page, "ja");
    expect(await read(page, "direction")).toBe(0);
  });
});

// An app no one chose a language for is written in whatever it is written
// in: its reader's browser being in Arabic does not lay it out from the
// right (Qt takes the direction from the translation installed). The page
// it is in says, until the app chooses.
test.describe("an app whose language no one chose", () => {
  test.use({ locale: "ar-EG" });
  const MAIN = 'import QtQuick\nColumn {\n  property int direction: Qt.application.layoutDirection\n  Text { text: "ملف واحد. Katrín" }\n}\n';
  const runs = (page) => page.evaluate(() => document.querySelector(".qq-text").getAttribute("dir"));

  test("is laid out from the left in a browser that reads from the right", async ({ page }) => {
    await page.goto("/compiler.html");
    await page.waitForFunction(() => window.ready);
    expect(await page.evaluate(() => navigator.language)).toBe("ar-EG");
    expect(await page.evaluate((files) => window.show({ files, entry: "Main.qml" }), { "Main.qml": MAIN })).toMatchObject({ mounted: true });
    expect(await read(page, "direction")).toBe(0);
    expect(await runs(page)).not.toBe("rtl");
    await language(page, "ar");
    expect(await read(page, "direction")).toBe(1);
  });

  test("is laid out the way its page says", async ({ page }) => {
    await page.goto("/compiler.html");
    await page.waitForFunction(() => window.ready);
    await page.evaluate(() => (document.documentElement.dir = "rtl"));
    expect(await page.evaluate((files) => window.show({ files, entry: "Main.qml" }), { "Main.qml": MAIN })).toMatchObject({ mounted: true });
    expect(await read(page, "direction")).toBe(1);
    expect(await runs(page)).toBe("rtl");
  });
});
