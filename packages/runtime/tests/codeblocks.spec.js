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
import { assemble, exampleFiles, extractBlocks, parseInfo, spliceHarness } from "../codeblocks/parse.js";
import { checkExamples, hashExample, loadPrerenders, renderPrerenders, renderStatic } from "../codeblocks/build.js";
import { liveCodeBlocks } from "../codeblocks/remark.js";
import { COUNTER, DOC, GROUP_MAIN, PANEL, SHELL_DOC, SNIPPET, WINDOW } from "./codeblocks-fixtures.js";
import { expect, test } from "./open.js";

const qmlc = process.env.QMLC ?? join(import.meta.dirname, "../../../target/debug/qmlc");

plain.describe("the fence contract", () => {
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
    liveCodeBlocks({ qmlc })(tree);
    expect(tree.children.map((n) => n.type)).toEqual(["paragraph", "html", "paragraph", "code"]);
    // The one figure's editor carries both files.
    expect(tree.children[1].value).toContain("Panel.qml");
    expect(tree.children[1].value).toContain("data-ljos-codeblock");
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
    const legacy = make();
    liveCodeBlocks({ qmlc })(legacy);
    expect(legacy.children[0].type).toBe("code");
    expect(() => liveCodeBlocks({ qmlc, strict: true })(make())).toThrow();
  });
});

const counterFigure = (page) => page.locator("[data-ljos-codeblock]").first();

async function opened(page) {
  await page.goto("/codeblocks.html");
  await page.waitForFunction(() => window.ready);
}

plain("with JS off the code and its prerendered result are readable and there is no editor", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${process.env.LJOS_WEB_PORT ?? 4174}/codeblocks.html`);
  const figure = counterFigure(page);
  await expect(figure.locator("pre code")).toContainText("Count: ");
  // The result is the example's own markup, its words readable as words.
  await expect(figure.locator(".ljos-codeblock__stage")).toContainText("Count: 0");
  await expect(figure.locator("[data-hk]").first()).toBeVisible();
  await expect(figure.locator("textarea")).toHaveCount(0);
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
    await figure.scrollIntoViewIfNeeded();
    await expect(figure).toHaveAttribute("data-state", "live", { timeout: 30000 });
    expect(await page.evaluate(() => document.querySelector(".ljos-codeblock__host").contains(window.prerenderedNode))).toBe(true);
    await expect(figure.locator(".ljos-codeblock__host")).toHaveAttribute("data-ljos-hydrated", "true");
    const editor = figure.getByRole("textbox", { name: /Main\.qml/ });
    await expect(editor).toHaveValue(/Count: /);
    const stage = figure.locator(".ljos-codeblock__stage");
    await expect(stage).toContainText("Count: 0");
    await stage.click();
    await stage.click();
    await stage.click();
    await expect(stage).toContainText("Count: 3");
    // Changing the colour recompiles and reloads: the count is kept.
    const value = await editor.inputValue();
    await editor.fill(value.replace("#20242e", "#7a1f1f"));
    await expect(stage).toContainText("Count: 3");
    await expect
      .poll(() =>
        stage.evaluate(
          (el) =>
            [...el.querySelectorAll("*")].some((node) => getComputedStyle(node).backgroundColor === "rgb(122, 31, 31)"),
        ),
      )
      .toBe(true);
  });

  test("a broken edit shows the compiler error inline and keeps the last good result", async ({ page }) => {
    await opened(page);
    const figure = counterFigure(page);
    await figure.scrollIntoViewIfNeeded();
    await expect(figure).toHaveAttribute("data-state", "live", { timeout: 30000 });
    const stage = figure.locator(".ljos-codeblock__stage");
    await stage.click();
    await expect(stage).toContainText("Count: 1");
    const editor = figure.getByRole("textbox", { name: /Main\.qml/ });
    const good = await editor.inputValue();
    await editor.fill(good.replace("width: 320", "width: 320 +"));
    await expect(figure.getByRole("alert")).toContainText(/Main\.qml:\d+/, { timeout: 30000 });
    await expect(stage).toContainText("Count: 1");
    await editor.fill(good);
    await expect(figure.getByRole("alert")).toBeHidden({ timeout: 30000 });
    await expect(stage).toContainText("Count: 1");
  });

  test("a harnessed snippet runs and its editor shows the snippet only", async ({ page }) => {
    await opened(page);
    const figure = page.locator("[data-ljos-codeblock]").nth(1);
    await figure.scrollIntoViewIfNeeded();
    await expect(figure).toHaveAttribute("data-state", "live", { timeout: 30000 });
    await expect(figure.locator(".ljos-codeblock__stage")).toContainText("Hello from a snippet");
    const editor = figure.getByRole("textbox");
    await expect(editor).not.toHaveValue(/240/);
    await editor.fill('Text {\n    anchors.centerIn: parent\n    color: "#e8eaf0"\n    text: "Edited snippet"\n}');
    await expect(figure.locator(".ljos-codeblock__stage")).toContainText("Edited snippet", { timeout: 30000 });
  });

  test("a grouped example runs and every file can be edited", async ({ page }) => {
    await opened(page);
    const figure = page.locator("[data-ljos-codeblock]").nth(2);
    await figure.scrollIntoViewIfNeeded();
    await expect(figure).toHaveAttribute("data-state", "live", { timeout: 30000 });
    await expect(figure.locator(".ljos-codeblock__stage")).toContainText("Panel");
    await figure.getByRole("button", { name: "Panel.qml" }).click();
    const editor = figure.getByRole("textbox", { name: /Panel\.qml/ });
    const value = await editor.inputValue();
    await editor.fill(value.replace('"Panel"', '"Edited panel"'));
    await expect(figure.locator(".ljos-codeblock__stage")).toContainText("Edited panel", { timeout: 30000 });
  });

  test("a ShellLoader example runs: editing the user's shell keeps the app's state", async ({ page }) => {
    await opened(page);
    const figure = page.locator("[data-ljos-codeblock]").nth(3);
    await figure.scrollIntoViewIfNeeded();
    await expect(figure).toHaveAttribute("data-state", "live", { timeout: 30000 });
    const stage = figure.locator(".ljos-codeblock__stage");
    await expect(stage).toContainText("My shell");
    await expect(stage).toContainText("Count: 0");
    await stage.click();
    await expect(stage).toContainText("Count: 1");
    // The visitor rewrites their shell; the app's contribution and its
    // count are still there, placed by the new shell.
    await figure.getByRole("button", { name: "user/Shell.qml" }).click();
    const editor = figure.getByRole("textbox", { name: /user\/Shell\.qml/ });
    const value = await editor.inputValue();
    await editor.fill(value.replace('"My shell"', '"Edited shell"'));
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
    await expect(page.locator("pre code.language-sh").locator("..").locator("textarea")).toHaveCount(0);
    await counterFigure(page).scrollIntoViewIfNeeded();
    await expect(counterFigure(page)).toHaveAttribute("data-state", "live", { timeout: 30000 });
    expect(fetched).toHaveLength(1);
  });
});
