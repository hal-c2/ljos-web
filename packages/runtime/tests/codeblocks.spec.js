// Live code blocks (SITE-2 goal 7): every non-exempt fenced block of a
// Markdown page is the code beside its running result. The build side
// parses the fence contract of SITE-2-CODEBLOCKS.md, checks each block
// with `qmlc`, prerenders each example (the runtime's own prerender),
// and writes static HTML (code + the prerendered result); the browser
// side hydrates that HTML into an editor whose edits recompile in the
// page and reload with state kept. Exempt blocks stay plain code.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as plain } from "@playwright/test";
import { Text } from "@codemirror/state";
import { assemble, displayPosition, exampleFiles, extractBlocks, parseInfo, spliceHarness } from "../codeblocks/parse.js";
import { checkExamples, hashExample, loadPrerenders, renderCode, renderPrerenders, renderStatic } from "../codeblocks/build.js";
import { toDiagnostics } from "../codeblocks/editor.js";
import { PACKED, packRich, unpackRich } from "../codeblocks/rich.js";
import { highlight } from "../markdown.js";
import { liveCodeBlocks } from "../codeblocks/remark.js";
import { COUNTER, DOC, GROUP_MAIN, PANEL, SHELL_DOC, SNIPPET, WINDOW } from "./codeblocks-fixtures.js";
import { expect, test } from "./open.js";

const qmlc = process.env.QMLC ?? join(import.meta.dirname, "../../../target/debug/qmlc");

plain.describe("the fence contract", () => {
  plain("a compiler's position in a harnessed snippet is moved back into the snippet", () => {
    const { examples } = assemble(extractBlocks(DOC), { harnesses: { window: WINDOW } });
    const [counter, harnessed] = examples;
    // The marker is the harness's 7th line, indented by four.
    expect(displayPosition(harnessed, { file: "Main.qml", line: 8, column: 16, message: "x" })).toEqual({ index: 0, line: 2, column: 12 });
    expect(displayPosition(harnessed, { file: "Main.qml", line: 8, column: 3, endLine: 9, endColumn: 9 })).toEqual({
      index: 0,
      line: 2,
      column: 1,
      endLine: 3,
      endColumn: 5,
    });
    // The harness's own lines are in no file the reader has.
    expect(displayPosition(harnessed, { file: "Main.qml", line: 2, column: 1 })).toEqual({ index: -1 });
    expect(displayPosition(harnessed, { file: "Main.qml", line: 13, column: 1 })).toEqual({ index: -1 });
    // A whole app is as compiled.
    expect(displayPosition(counter, { file: "Main.qml", line: 5, column: 5 })).toEqual({ index: 0, line: 5, column: 5 });
    expect(displayPosition(counter, { file: "Other.qml", line: 5 })).toEqual({ index: -1 });
  });

  plain("a diagnostic becomes an editor's mark: its range, or its word, or its line's start", () => {
    const doc = Text.of(["Rectangle {", "    width: 320 +", "}"]);
    const [range, word, line] = toDiagnostics(doc, [
      { message: "a", line: 2, column: 5, endLine: 2, endColumn: 10 },
      { message: "b", line: 2, column: 5, code: "E1", severity: "warning" },
      { message: "c" },
    ]);
    expect(range).toMatchObject({ from: 16, to: 21, severity: "error", message: "a" });
    expect(word).toMatchObject({ from: 16, to: 21, severity: "warning", message: "b [E1]" });
    expect(line).toMatchObject({ from: 0, to: 9 });
    // Past the end is clamped into the text, on its last character;
    // spaces before a word are not the word.
    const [past, spaced] = toDiagnostics(doc, [{ message: "d", line: 9, column: 40 }, { message: "e", line: 2, column: 1 }]);
    expect(past).toMatchObject({ from: doc.length - 1, to: doc.length });
    expect(spaced).toMatchObject({ from: 16, to: 21 });
    // An unclosed block is told at the end of the file, on an empty
    // last line: the mark is the last sign before it, never empty.
    const open = Text.of(["Rectangle {", "    Item {", "}", ""]);
    const [eof] = toDiagnostics(open, [{ message: "f", line: 4, column: 1 }]);
    expect(eof).toMatchObject({ from: open.line(3).from, to: open.line(3).from + 1 });
    expect(renderCode("a < b", "sh")).toBe('<pre class="ljos-code"><code class="language-sh">a &lt; b</code></pre>');
  });

  plain("info strings parse: whole app, harness, before, file and group", () => {
    expect(parseInfo("qml")).toEqual({ lang: "qml" });
    expect(parseInfo("qml harness=window")).toEqual({ lang: "qml", harness: "window" });
    expect(parseInfo("qml before")).toEqual({ lang: "qml", before: true });
    expect(parseInfo("qml before harness=column")).toEqual({ lang: "qml", before: true, harness: "column" });
    expect(parseInfo("qml file=Panel.qml group=pair")).toEqual({ lang: "qml", file: "Panel.qml", group: "pair" });
    expect(parseInfo("ts file=logic.ts group=pair")).toEqual({ lang: "ts", file: "logic.ts", group: "pair" });
    expect(parseInfo("sh")).toEqual({ lang: "sh" });
    expect(parseInfo("")).toEqual({ lang: "" });
  });

  plain("a snippet replaces the harness's marker line at its indentation", () => {
    expect(spliceHarness(WINDOW, SNIPPET)).toContain(
      '    Text {\n        anchors.centerIn: parent\n        color: "#e8eaf0"\n        text: "Hello from a snippet"\n    }',
    );
    expect(spliceHarness(WINDOW, SNIPPET)).not.toContain("//! snippet");
    expect(() => spliceHarness("Rectangle {}\n", SNIPPET)).toThrow(/snippet/);
    expect(() => spliceHarness("//! snippet\n//! snippet\n", SNIPPET)).toThrow(/snippet/);
  });

  plain("blocks assemble: single, harnessed, grouped, before, exempt", () => {
    const { examples, plain: left } = assemble(extractBlocks(DOC), { harnesses: { window: WINDOW } });
    expect(examples).toHaveLength(4);
    expect(left.map((b) => b.lang)).toEqual(["sh"]);

    const [counter, harnessed, group, before] = examples;
    expect(exampleFiles(counter)).toEqual({ entry: "Main.qml", files: { "Main.qml": COUNTER.trimEnd() + "\n" } });

    // The editor shows the snippet; what compiles is the spliced harness.
    expect(harnessed.display).toEqual([{ name: "Main.qml", code: SNIPPET + "\n", lang: "qml" }]);
    expect(exampleFiles(harnessed).files["Main.qml"]).toBe(spliceHarness(WINDOW, SNIPPET));

    expect(group.entry).toBe("Main.qml");
    expect(Object.keys(exampleFiles(group).files).sort()).toEqual(["Main.qml", "Panel.qml"]);
    expect(group.display.map((f) => f.name)).toEqual(["Main.qml", "Panel.qml"]);

    expect(before.before).toBe(true);
  });

  plain("a fence inside a list item reads as an mdast parse reads it", () => {
    // The prerender step reads raw text and the remark plugin reads
    // mdast: both must give the same code, or their hashes part and
    // the block loses its prerender — or worse, its failure mark.
    const listed = ["1. Step", "", "   ```qml", "   Rectangle {", "       width: 10", "   }", "   ```", ""].join("\n");
    const [block] = extractBlocks(listed);
    expect(block.code).toBe("Rectangle {\n    width: 10\n}\n");
    const [fromList] = assemble([block], {}).examples;
    const [flat] = assemble(extractBlocks("```qml\nRectangle {\n    width: 10\n}\n```\n"), {}).examples;
    expect(hashExample(fromList)).toBe(hashExample(flat));
  });

  plain("a file name that leaves its example is refused", () => {
    const doc = "```qml file=../../x.qml group=g\nRectangle {}\n```\n";
    expect(() => assemble(extractBlocks(doc), {})).toThrow(/not a name inside its example/);
    const abs = "```qml file=/tmp/x.qml group=g\nRectangle {}\n```\n";
    expect(() => assemble(extractBlocks(abs), {})).toThrow(/not a name inside its example/);
  });

  plain("unknown and bare tags are not silently runnable", () => {
    const { examples, plain: left, unknown } = assemble(extractBlocks("```\ncode\n```\n\n```cobol\nx\n```\n"), {});
    expect(examples).toEqual([]);
    expect(unknown.map((b) => b.lang)).toEqual(["", "cobol"]);
    expect(left).toEqual([]);
  });

  plain("the content hash is stable and follows the code", () => {
    const { examples } = assemble(extractBlocks(DOC), { harnesses: { window: WINDOW } });
    const [counter] = examples;
    expect(hashExample(counter)).toMatch(/^[0-9a-f]{16,}$/);
    expect(hashExample(counter)).toBe(hashExample(structuredClone(counter)));
    const edited = structuredClone(counter);
    edited.display[0].code = edited.display[0].code.replace("#20242e", "#7a1f1f");
    expect(hashExample(edited)).not.toBe(hashExample(counter));
  });
});

plain("prerenders are made by running each example; a throw is a failure, not the end", async ({}, info) => {
  info.setTimeout(180_000);
  const one = (code) => assemble(extractBlocks("```qml\n" + code.trimEnd() + "\n```\n"), {}).examples[0];
  const counter = one(COUNTER);
  // Only an implicit size: still its own markup, words and all.
  const implicit = one(`import QtQuick

Column {
    spacing: 4
    Text { text: "One" }
    Text { text: "Two" }
}
`);
  // `states` is Item's own list; a string of that name throws as the
  // object completes (a docs example does exactly this).
  const throwing = one(`import QtQuick

Item {
    width: 40
    height: 40
    property string states: ""
}
`);
  const cacheDir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-codeblock-test-"));
  try {
    const { manifest, failures } = await renderPrerenders([counter, implicit, throwing], { cacheDir, qmlc });
    const loaded = loadPrerenders(cacheDir);
    // The prerendered result is the page's own markup: its words, and
    // the keys hydration knows its elements by.
    expect(loaded[hashExample(counter)].html).toContain("Count: 0");
    expect(loaded[hashExample(counter)].html).toContain("data-hk");
    expect(loaded[hashExample(counter)]).toMatchObject({ width: 320, height: 180 });
    expect(loaded[hashExample(implicit)].html).toContain("One");
    expect(failures).toHaveLength(1);
    expect(failures[0].example).toBe(throwing);
    expect(failures[0].diagnostics.join("\n")).toContain("Main.qml");
    // Cached: a second run makes nothing and answers the same manifest.
    const again = await renderPrerenders([counter], { cacheDir, qmlc });
    expect(again.failures).toEqual([]);
    expect(again.manifest[hashExample(counter)]).toEqual(manifest[hashExample(counter)]);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

plain.describe("the build-time check and static HTML", () => {
  plain("qmlc passes the fixture examples and names a broken one", () => {
    const { examples } = assemble(extractBlocks(DOC), { harnesses: { window: WINDOW } });
    expect(checkExamples(examples, { qmlc })).toEqual([]);
    const broken = structuredClone(examples[0]);
    broken.display[0].code = broken.display[0].code.replace("width: 320", "width: 320 +");
    const failures = checkExamples([broken], { qmlc });
    expect(failures).toHaveLength(1);
    expect(failures[0].diagnostics.join("\n")).toMatch(/Main\.qml:\d+/);
  });

  plain("a ShellLoader example (Ljos.Blocks, files in folders) assembles and checks", () => {
    const { examples } = assemble(extractBlocks(SHELL_DOC), {});
    expect(examples).toHaveLength(1);
    expect(Object.keys(exampleFiles(examples[0]).files).sort()).toEqual(["Default.qml", "Main.qml", "user/Shell.qml"]);
    expect(checkExamples(examples, { qmlc })).toEqual([]);
  });

  // A site ships every page's colouring in its first script: packed, a
// token is its text and three marks, and it reads back to the very
// markup the build wrote, or is shipped as that markup.
plain("a block's colouring packs small and reads back exactly", () => {
  const code = 'import QtQuick\nRectangle { width: 10; /* a<b & c */ text: "x > y"; onClicked: f(a.b) }\nx = a |> % + 1';
  for (const lang of ["qml", "ts", "sh", "rust"]) {
    const html = highlight(code, lang);
    const packed = packRich(html);
    expect(packed.startsWith(PACKED)).toBe(true);
    expect(unpackRich(packed)).toBe(html);
    // The grammar's colouring is a span on nearly every token.
    expect(packed.length).toBeLessThan(lang === "qml" || lang === "ts" ? html.length / 2 : html.length);
  }
  // Tokens that touch close no span between them.
  expect(packRich(highlight("a.b()", "ts"))).toBe(`${PACKED}<ia<k.<gb<k(<k)>`);
  // What is not the colouring's own markup is shipped as it is.
  expect(unpackRich(packRich(`${PACKED}<a`))).toBe("&#xE000;<a");
  for (const html of ['<span class="tok-unknown">x</span>', "", "plain"]) {
    expect(unpackRich(packRich(html))).toBe(html);
  }
  expect(packRich('<span class="tok-unknown">x</span>')).toBe('<span class="tok-unknown">x</span>');
  expect(unpackRich("<b>not packed</b>")).toBe("<b>not packed</b>");
});

plain("static HTML shows code and the prerendered result and carries the payload", () => {
    const { examples } = assemble(extractBlocks(DOC), { harnesses: { window: WINDOW } });
    const html = renderStatic(examples[0], { prerender: `<div data-hk="1:Rectangle" style="width: 320px; height: 180px">Count: 0</div>` });
    expect(html).toContain('style="width:320px;height:180px"');
    expect(html).toContain('data-ljos-codeblock');
    expect(html).toContain('data-state="static"');
    expect(html).toContain("Count: ");
    expect(html).toContain(`<div data-hk="1:Rectangle" style="width: 320px; height: 180px">Count: 0</div>`);
    expect(html).toContain('type="application/json"');
    // The payload round-trips to the example's files.
    const payload = JSON.parse(html.match(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/)[1]);
    expect(payload.entry).toBe("Main.qml");
    expect(payload.prerendered).toBe(true);
    expect(payload.display[0].code).toContain("Count: ");
    // The code is highlighted by the build, with the grammar's classes,
    // and its column, which can scroll, is a tab stop.
    expect(html).toContain('<pre class="ljos-code" tabindex="0"><code class="language-qml">');
    expect(html).toMatch(/<span class="tok-typeName">Text<\/span>/);
    expect(html).toMatch(/<span class="tok-string">&quot;Count: &quot;<\/span>/);
    // A before block is labelled as the old half.
    expect(renderStatic(examples[3], {})).toContain("Before");
    // The committed test page's figures are renderStatic's over real
    // prerenders: hold it to their shape, not to a copy of this call.
    const page = readFileSync(join(import.meta.dirname, "codeblocks.html"), "utf8");
    expect(page).toContain('data-state="static"');
    expect(page).toContain("data-hk");
    expect(page).toContain("Count: 0");
  });

  plain("the remark plugin turns runnable blocks into figures and leaves exempt ones", () => {
    const code = (lang, meta, value) => ({ type: "code", lang, meta, value });
    const tree = {
      type: "root",
      children: [
        code("qml", null, COUNTER.trimEnd()),
        { type: "paragraph", children: [{ type: "text", value: "between" }] },
        code("qml", "harness=window", SNIPPET),
        code("qml", "file=Main.qml group=pair", GROUP_MAIN.trimEnd()),
        code("qml", "file=Panel.qml group=pair", PANEL.trimEnd()),
        code("sh", null, "ljos check Main.qml"),
      ],
    };
    liveCodeBlocks({ harnesses: { window: WINDOW }, qmlc })(tree);
    const kinds = tree.children.map((n) => n.type);
    // counter figure, paragraph, harness figure, one group figure, sh code
    // (a language the grammar does not read stays the host's)
    expect(kinds).toEqual(["html", "paragraph", "html", "html", "code"]);
    expect(tree.children[0].value).toContain("data-ljos-codeblock");
    expect(tree.children.at(-1).lang).toBe("sh");
  });

  plain("a group spread through prose is one figure at its entry, the rest staying code", () => {
    const code = (lang, meta, value) => ({ type: "code", lang, meta, value });
    const prose = (value) => ({ type: "paragraph", children: [{ type: "text", value }] });
    const tree = {
      type: "root",
      children: [
        prose("The app:"),
        code("qml", "file=Main.qml group=pair", GROUP_MAIN.trimEnd()),
        prose("Its panel:"),
        code("qml", "file=Panel.qml group=pair", PANEL.trimEnd()),
      ],
    };
    // A host that colours its code at build time asks for it.
    liveCodeBlocks({ qmlc, highlight: true })(tree);
    expect(tree.children.map((n) => n.type)).toEqual(["paragraph", "html", "paragraph", "html"]);
    // The one figure's editor carries both files.
    expect(tree.children[1].value).toContain("Panel.qml");
    expect(tree.children[1].value).toContain("data-ljos-codeblock");
    // The fence left in the flow is code, highlighted, not a figure.
    expect(tree.children[3].value).toMatch(/^<pre class="ljos-code"><code class="language-qml">/);
    expect(tree.children[3].value).not.toContain("data-ljos-codeblock");
  });

  plain("a tagged block that cannot compile fails the build", () => {
    const tree = {
      type: "root",
      children: [{ type: "code", lang: "qml", meta: "harness=window", value: "Text { width: 1 +" }],
    };
    expect(() => liveCodeBlocks({ harnesses: { window: WINDOW }, qmlc })(tree)).toThrow(/Main\.qml/);
  });

  plain("an untagged block that cannot compile stays plain in legacy mode, and fails when strict", () => {
    const make = () => ({
      type: "root",
      children: [{ type: "code", lang: "qml", meta: null, value: "Rectangle { width: 1 +" }],
    });
    // Left to the host's highlighting unless the host asks for the build's.
    const host = make();
    liveCodeBlocks({ qmlc })(host);
    expect(host.children[0].type).toBe("code");
    const legacy = make();
    liveCodeBlocks({ qmlc, highlight: true })(legacy);
    // Plain code, not a figure: highlighted, its broken end marked.
    expect(legacy.children[0].type).toBe("html");
    expect(legacy.children[0].value).not.toContain("data-ljos-codeblock");
    expect(legacy.children[0].value).toContain('<span class="tok-typeName">Rectangle</span>');
    expect(() => liveCodeBlocks({ qmlc, strict: true })(make())).toThrow();
  });
});

const counterFigure = (page) => page.locator("[data-ljos-codeblock]").first();

async function opened(page, query = "") {
  await page.goto(`/codeblocks.html${query}`);
  await page.waitForFunction(() => window.ready);
}

// A block's editor for a file, once CodeMirror is in: its content
// element is the textbox (the `<pre>` before it is one too, so the
// editor is waited for, not raced).
async function editorOf(figure, name) {
  await expect(figure).toHaveAttribute("data-editor", "ready", { timeout: 30000 });
  return figure.locator(".cm-content").and(figure.getByRole("textbox", { name }));
}

// What an editor holds, line by line as it shows it.
const textOf = (editor) => editor.evaluate((el) => [...el.querySelectorAll(".cm-line")].map((line) => line.textContent).join("\n"));

// A reader replacing everything in the editor with `text`.
async function retype(editor, text) {
  await editor.focus();
  await editor.press("ControlOrMeta+a");
  await editor.page().keyboard.insertText(text);
  await expect.poll(() => textOf(editor)).toBe(text);
}

async function live(figure) {
  await figure.scrollIntoViewIfNeeded();
  await expect(figure).toHaveAttribute("data-state", "live", { timeout: 30000 });
}

plain("with JS off the code is highlighted, its prerendered result readable, and there is no editor", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${process.env.LJOS_WEB_PORT ?? 4174}/codeblocks.html`);
  const figure = counterFigure(page);
  await expect(figure.locator("pre code")).toContainText("Count: ");
  // The build wrote the grammar's classes: the colours need no script.
  await expect(figure.locator("pre code .tok-typeName").filter({ hasText: /^Rectangle$/ })).toHaveCount(1);
  await expect(figure.locator("pre code .tok-propertyName").filter({ hasText: /^width$/ }).first()).toBeVisible();
  await expect(figure.locator("pre code .tok-string").first()).toBeVisible();
  // The result is the example's own markup, its words readable as words.
  await expect(figure.locator(".ljos-codeblock__stage")).toContainText("Count: 0");
  await expect(figure.locator("[data-hk]").first()).toBeVisible();
  await expect(figure.locator("textarea, .cm-editor, [contenteditable]")).toHaveCount(0);
  await context.close();
});

test.describe("a live code block in the page", () => {
  // A ShellLoader loads its shell as it can (async, by design), so
  // that subtree is made after hydration's window and the runtime
  // says so once; the app around it is adopted, as its test holds.
  test.use({ told: [/hydration mismatch/] });
  test("hydrates into an editor, runs, and an edit keeps state", async ({ page }) => {
    await opened(page);
    const figure = counterFigure(page);
    // The prerendered node a reader had is the node that then behaves.
    await page.evaluate(() => {
      window.prerenderedNode = document.querySelector("[data-ljos-codeblock] [data-hk]");
    });
    await live(figure);
    expect(await page.evaluate(() => document.querySelector(".ljos-codeblock__host").contains(window.prerenderedNode))).toBe(true);
    await expect(figure.locator(".ljos-codeblock__host")).toHaveAttribute("data-ljos-hydrated", "true");
    const editor = await editorOf(figure, /Main\.qml/);
    expect(await textOf(editor)).toMatch(/Count: /);
    // The editor colours with the classes the build wrote.
    await expect(editor.locator(".tok-typeName").filter({ hasText: /^Rectangle$/ })).toHaveCount(1);
    const stage = figure.locator(".ljos-codeblock__stage");
    await expect(stage).toContainText("Count: 0");
    await stage.click();
    await stage.click();
    await stage.click();
    await expect(stage).toContainText("Count: 3");
    // Changing the colour recompiles and reloads: the count is kept.
    await retype(editor, (await textOf(editor)).replace("#20242e", "#7a1f1f"));
    await expect(stage).toContainText("Count: 3");
    await expect
      .poll(() =>
        stage.evaluate(
          (el) =>
            [...el.querySelectorAll("*")].some((node) => getComputedStyle(node).backgroundColor === "rgb(122, 31, 31)"),
        ),
      )
      .toBe(true);
    // Reset puts the code back, in the editor too.
    await figure.getByRole("button", { name: "Reset" }).click();
    await expect.poll(() => textOf(editor)).toMatch(/#20242e/);
  });

  test("Tab indents, and Escape then Tab (or Shift+Tab) leaves the editor", async ({ page }) => {
    await opened(page);
    const figure = counterFigure(page);
    await live(figure);
    const editor = await editorOf(figure, /Main\.qml/);
    await expect(editor).toHaveAttribute("aria-description", /Escape, then Tab/);
    await editor.focus();
    await editor.press("ControlOrMeta+Home");
    await editor.press("Tab");
    await expect.poll(() => textOf(editor)).toMatch(/^ {4}import/);
    await expect(editor).toBeFocused();
    await editor.press("Escape");
    await editor.press("Tab");
    await expect(editor).not.toBeFocused();
    // Back in: Shift+Tab leaves at once, without an Escape first.
    await editor.focus();
    await expect(editor).toBeFocused();
    await editor.press("Shift+Tab");
    await expect(editor).not.toBeFocused();
    // And in again, Tab indents again: Escape lasted one visit.
    await editor.focus();
    await editor.press("Tab");
    await expect(editor).toBeFocused();
  });

  test("a broken edit is marked where it is wrong, summed up, and keeps the last good result", async ({ page }) => {
    await opened(page);
    const figure = counterFigure(page);
    await live(figure);
    const stage = figure.locator(".ljos-codeblock__stage");
    await stage.click();
    await expect(stage).toContainText("Count: 1");
    const editor = await editorOf(figure, /Main\.qml/);
    const good = await textOf(editor);
    await retype(editor, good.replace("width: 320", "width: 320 +"));
    // The summary a screen reader hears, and the squiggle a reader sees.
    const alert = figure.getByRole("alert");
    await expect(alert).toContainText(/Main\.qml:\d+:\d+: /, { timeout: 30000 });
    await expect(editor.locator(".cm-lintRange-error").first()).toBeVisible();
    await expect(editor).toHaveAttribute("aria-invalid", "true");
    await expect(editor).toHaveAttribute("aria-errormessage", (await alert.getAttribute("id")) ?? "");
    // The squiggle is the theme's colour, as a text decoration.
    expect(await editor.locator(".cm-lintRange-error").first().evaluate((el) => getComputedStyle(el).textDecorationStyle)).toBe("wavy");
    // The line the summary names is a line of the code the reader has.
    const [, line] = /Main\.qml:(\d+):/.exec(await alert.textContent());
    expect(Number(line)).toBeLessThanOrEqual(good.split("\n").length);
    await expect(stage).toContainText("Count: 1");
    await retype(editor, good);
    await expect(alert).toBeHidden({ timeout: 30000 });
    await expect(editor.locator(".cm-lintRange-error")).toHaveCount(0);
    await expect(editor).not.toHaveAttribute("aria-invalid", "true");
    await expect(stage).toContainText("Count: 1");
  });

  test("a harnessed snippet runs, its editor shows the snippet only, and its errors are placed in it", async ({ page }) => {
    await opened(page);
    const figure = page.locator("[data-ljos-codeblock]").nth(1);
    await live(figure);
    await expect(figure.locator(".ljos-codeblock__stage")).toContainText("Hello from a snippet");
    const editor = await editorOf(figure, /harness/);
    expect(await textOf(editor)).not.toMatch(/240/);
    await retype(editor, 'Text {\n    anchors.centerIn: parent\n    color: "#e8eaf0"\n    text: "Edited snippet"\n}');
    await expect(figure.locator(".ljos-codeblock__stage")).toContainText("Edited snippet", { timeout: 30000 });
    // Broken on the snippet's third line: the summary counts lines of
    // the snippet, not of the harness it compiled in.
    await retype(editor, 'Text {\n    anchors.centerIn: parent\n    color: "#e8eaf0" +\n}');
    await expect(figure.getByRole("alert")).toContainText(/Main\.qml:[34]:/, { timeout: 30000 });
    await expect(editor.locator(".cm-lintRange-error").first()).toBeVisible();
  });

  test("a grouped example runs and every file can be edited", async ({ page }) => {
    await opened(page);
    const figure = page.locator("[data-ljos-codeblock]").nth(2);
    await live(figure);
    await expect(figure.locator(".ljos-codeblock__stage")).toContainText("Panel");
    const editor = await editorOf(figure, /Panel\.qml/);
    await retype(editor, (await textOf(editor)).replace('"Panel"', '"Edited panel"'));
    await expect(figure.locator(".ljos-codeblock__stage")).toContainText("Edited panel", { timeout: 30000 });
  });

  test("a ShellLoader example runs: editing the user's shell keeps the app's state", async ({ page }) => {
    await opened(page);
    const figure = page.locator("[data-ljos-codeblock]").nth(3);
    await live(figure);
    const stage = figure.locator(".ljos-codeblock__stage");
    await expect(stage).toContainText("My shell");
    await expect(stage).toContainText("Count: 0");
    await stage.click();
    await expect(stage).toContainText("Count: 1");
    // The visitor rewrites their shell; the app's contribution and its
    // count are still there, placed by the new shell.
    const editor = await editorOf(figure, /user\/Shell\.qml/);
    await retype(editor, (await textOf(editor)).replace('"My shell"', '"Edited shell"'));
    await expect(stage).toContainText("Edited shell", { timeout: 30000 });
    await expect(stage).toContainText("Count: 1");
  });

  test("blocks mount only when visible, and exempt code stays plain", async ({ page }) => {
    const fetched = [];
    page.on("request", (request) => {
      if (/ljos_web_compiler\.wasm/.test(request.url())) fetched.push(request.url());
    });
    await opened(page);
    // The page opens at the top; every block is below a tall spacer.
    await page.waitForLoadState("networkidle");
    expect(fetched).toEqual([]);
    await expect(page.locator("pre code.language-sh")).toContainText("ljos check");
    await expect(page.locator("pre code.language-sh").locator("..").locator("textarea, .cm-editor")).toHaveCount(0);
    await live(counterFigure(page));
    expect(fetched).toHaveLength(1);
  });

  test("the editor loads only when a reader reaches for the code, and takes over without moving a line", async ({ page }) => {
    const editorRequests = [];
    page.on("request", (request) => {
      if (/codemirror|codeblocks\/editor\.js/.test(request.url())) editorRequests.push(request.url());
    });
    await opened(page, "?editor=on-demand");
    const figure = counterFigure(page);
    await live(figure);
    await page.waitForLoadState("networkidle");
    // Running, compiled, and still the build's highlighted <pre>.
    expect(editorRequests).toEqual([]);
    await expect(figure.locator(".cm-editor")).toHaveCount(0);
    const pre = figure.locator("pre.ljos-code");
    await expect(pre).toHaveAttribute("role", "textbox");
    const box = (locator) => locator.evaluate((el) => {
      const { x, y, width, height } = el.getBoundingClientRect();
      return { x, y, width, height };
    });
    const before = { code: await box(pre), figure: await box(figure), first: await box(pre.locator(".tok-keyword").first()) };
    await page.evaluate(() => {
      window.shifts = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.shifts += entry.value;
      }).observe({ type: "layout-shift", buffered: false });
    });
    // Reaching in with the keyboard brings the editor, focused.
    await pre.focus();
    const editor = await editorOf(figure, /Main\.qml/);
    await expect(editor).toBeFocused();
    expect(editorRequests.length).toBeGreaterThan(0);
    const after = {
      code: await box(figure.locator(".ljos-codeblock__editor")),
      figure: await box(figure),
      first: await box(editor.locator(".tok-keyword").first()),
    };
    for (const part of ["code", "figure", "first"])
      for (const side of ["x", "y", "width", "height"]) expect(Math.abs(after[part][side] - before[part][side]), `${part}.${side}`).toBeLessThan(0.5);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expect(await page.evaluate(() => window.shifts)).toBe(0);
  });

  test("what a reader does while the editor is on its way is kept: the last press places the caret, and their typing lands there", async ({ page }) => {
    // The editor's code is held back until the reader has acted, so
    // every press and key below comes before it.
    let release;
    const held = new Promise((resolve) => (release = resolve));
    await page.route(/codemirror|codeblocks\/editor\.js/, async (route) => {
      await held;
      await route.continue();
    });
    await opened(page, "?editor=on-demand");
    const figure = counterFigure(page);
    await live(figure);
    const pre = figure.locator("pre.ljos-code");
    // Focus asks for the editor first; the press that follows is the one that counts.
    await pre.focus();
    const word = pre.locator(".tok-typeName").filter({ hasText: /^Rectangle$/ });
    const { height } = await word.boundingBox();
    await word.click({ position: { x: 1, y: height / 2 } });
    await page.keyboard.type("Z");
    await expect(figure.locator(".cm-editor")).toHaveCount(0);
    release();
    const editor = await editorOf(figure, /Main\.qml/);
    await expect(editor).toBeFocused();
    await expect.poll(() => textOf(editor)).toMatch(/ZRectangle/);
  });

  test("typing held while the editor is on its way keeps its Enters and Backspaces", async ({ page }) => {
    let release;
    const held = new Promise((resolve) => (release = resolve));
    await page.route(/codemirror|codeblocks\/editor\.js/, async (route) => {
      await held;
      await route.continue();
    });
    await opened(page, "?editor=on-demand");
    const figure = counterFigure(page);
    await live(figure);
    const word = figure.locator("pre.ljos-code .tok-typeName").filter({ hasText: /^Rectangle$/ });
    const { height } = await word.boundingBox();
    await word.click({ position: { x: 1, y: height / 2 } });
    await page.keyboard.type("ab");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Enter");
    await page.keyboard.type("c");
    release();
    const editor = await editorOf(figure, /Main\.qml/);
    await expect.poll(() => textOf(editor)).toMatch(/a\ncRectangle/);
  });

  test("Reset while the editor is on its way drops what was typed for it", async ({ page }) => {
    let release;
    const held = new Promise((resolve) => (release = resolve));
    await page.route(/codemirror|codeblocks\/editor\.js/, async (route) => {
      await held;
      await route.continue();
    });
    await opened(page, "?editor=on-demand");
    const figure = counterFigure(page);
    await live(figure);
    const before = await figure.locator("pre.ljos-code").textContent();
    await figure.locator("pre.ljos-code .tok-typeName").filter({ hasText: /^Rectangle$/ }).click();
    await page.keyboard.type("Z");
    await figure.getByRole("button", { name: "Reset" }).click();
    release();
    const editor = await editorOf(figure, /Main\.qml/);
    await expect.poll(() => textOf(editor)).toBe(before);
  });

  test("typing held while the editor is on its way stays in the file it was typed in", async ({ page }) => {
    let release;
    const held = new Promise((resolve) => (release = resolve));
    await page.route(/codemirror|codeblocks\/editor\.js/, async (route) => {
      await held;
      await route.continue();
    });
    await opened(page, "?editor=on-demand");
    const figure = page.locator("[data-ljos-codeblock]").nth(2);
    await live(figure);
    const main = figure.getByRole("textbox", { name: /Main\.qml/ });
    const panel = figure.getByRole("textbox", { name: /Panel\.qml/ });
    await main.focus();
    await page.keyboard.type("X");
    await panel.focus();
    await page.keyboard.type("Y");
    await expect(figure.locator(".cm-editor")).toHaveCount(0);
    release();
    const mainEditor = await editorOf(figure, /Main\.qml/);
    const panelEditor = await editorOf(figure, /Panel\.qml/);
    await expect.poll(() => textOf(mainEditor)).toMatch(/^X/);
    await expect.poll(() => textOf(panelEditor)).toMatch(/^Y/);
    expect(await textOf(mainEditor)).not.toContain("Y");
    await expect(panelEditor).toBeFocused();
  });

  test.describe("with the network failing once", () => {
    // The failed load is the browser's to report, and only it.
    test.use({ told: [[/hydration mismatch/, /Failed to load resource: net::ERR_FAILED/], { option: true }] });
    test("an editor that fails to load leaves the code as it was, and the next reach brings it in", async ({ page }) => {
      let failed = 0;
      await page.route(/codeblocks\/editor\.js/, (route) => (failed++ ? route.continue() : route.abort()));
      await opened(page, "?editor=on-demand");
      const figure = counterFigure(page);
      await live(figure);
      const pre = figure.locator("pre.ljos-code");
      await pre.focus();
      await expect.poll(() => failed).toBe(1);
      await expect(figure.locator(".cm-editor")).toHaveCount(0);
      await expect(pre).toBeVisible();
      await expect(figure.locator(".ljos-codeblock__stage")).toContainText("Count: 0");
      await pre.blur();
      await pre.focus();
      const editor = await editorOf(figure, /Main\.qml/);
      await expect(editor).toBeFocused();
    });
  });
});

plain("on a phone the code is 16px, a tap puts the caret in the editor, and nothing scrolls sideways", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${process.env.LJOS_WEB_PORT ?? 4174}/codeblocks.html`);
  await page.waitForFunction(() => window.ready);
  const figure = counterFigure(page);
  await live(figure);
  // Below 16px a phone zooms into a field on focus.
  expect(parseFloat(await figure.locator("pre.ljos-code, .ljos-codeblock__editor").first().evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  const editor = await editorOf(figure, /Main\.qml/);
  expect(parseFloat(await editor.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await editor.locator(".cm-line").nth(2).tap();
  await expect(editor).toBeFocused();
  for (const at of await page.locator("[data-ljos-codeblock]").all()) await at.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await context.close();
});
