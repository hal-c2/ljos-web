// Live code blocks (SITE-2 goal 7): every non-exempt fenced block of a
// Markdown page is the code beside its running result. The build side
// parses the fence contract of SITE-2-CODEBLOCKS.md, checks each block
// with `qmlc`, prerenders each example (the runtime's own prerender),
// and writes static HTML (code + the prerendered result); the browser
// side hydrates that HTML into an editor whose edits recompile in the
// page and reload with state kept. Exempt blocks stay plain code.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as plain } from "@playwright/test";
import { Text } from "@codemirror/state";
import { assemble, displayPosition, exampleFiles, extractBlocks, parseInfo, spliceHarness } from "../codeblocks/parse.js";
import { checkExamples, checkExamplesAll, hashExample, loadPrerenders, prerenderSize, prerenderStamp, pruneCache, renderCode, renderPrerenders, renderStatic } from "../codeblocks/build.js";
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

  plain("a data or javascript block of a group is a file of its example, wherever it is written", () => {
    const doc = [
      "```json file=activity.json group=feed",
      '{ "rows": [1, 2] }',
      "```",
      "",
      "```qml group=feed",
      "Rectangle {}",
      "```",
      "",
      "```javascript file=lib/rules.js group=feed",
      "export const a = 1;",
      "```",
      "",
      "```qml file=parts/Badge.qml group=feed",
      "Rectangle {}",
      "```",
      "",
      "```xml file=feed.xml group=feed",
      "<rss/>",
      "```",
      "",
      "```json",
      "{}",
      "```",
      "",
      "```javascript",
      "plain()",
      "```",
      "",
    ].join("\n");
    const { examples, plain: left } = assemble(extractBlocks(doc), {});
    expect(examples).toHaveLength(1);
    const [feed] = examples;
    expect(feed.entry).toBe("Main.qml");
    expect(feed.display.map((f) => [f.name, f.lang])).toEqual([
      ["activity.json", "json"],
      ["Main.qml", "qml"],
      ["lib/rules.js", "javascript"],
      ["parts/Badge.qml", "qml"],
      ["feed.xml", "xml"],
    ]);
    expect(exampleFiles(feed).files["activity.json"]).toBe('{ "rows": [1, 2] }\n');
    // Without group= and file= a data block is shown, not run.
    expect(left.map((b) => b.lang)).toEqual(["json", "javascript"]);
    // A data block of a group names its file.
    expect(() => assemble(extractBlocks("```qml group=g\nRectangle {}\n```\n```json group=g\n{}\n```\n"), {})).toThrow(
      /needs file=/,
    );
  });

  plain("files= on a root gives the example the files the site holds, by name, as bytes", () => {
    const held = { "photo.jpg": new Uint8Array([0xff, 0xd8, 0xff]), "icons/ok.svg": new TextEncoder().encode("<svg/>") };
    const files = (name) => held[name];
    const doc = "```qml files=photo.jpg,icons/ok.svg\nRectangle {}\n```\n";
    const [example] = assemble(extractBlocks(doc), { files }).examples;
    expect(parseInfo("qml files=a.png,b.wav")).toEqual({ lang: "qml", files: "a.png,b.wav" });
    // Shown nowhere, compiled with the rest.
    expect(example.display.map((f) => f.name)).toEqual(["Main.qml"]);
    const compiled = exampleFiles(example).files;
    expect(compiled["photo.jpg"]).toEqual(held["photo.jpg"]);
    expect(compiled["icons/ok.svg"]).toEqual(held["icons/ok.svg"]);
    // They are part of what it is: another picture is another example.
    const other = assemble(extractBlocks(doc), { files: (name) => (name === "photo.jpg" ? new Uint8Array([1]) : held[name]) }).examples[0];
    expect(hashExample(other)).not.toBe(hashExample(example));

    const refused = (info, reader = files) => () => assemble(extractBlocks("```qml " + info + "\nRectangle {}\n```\n"), { files: reader });
    expect(refused("files=../secret.txt")).toThrow(/not a name inside files/);
    expect(refused("files=/etc/passwd")).toThrow(/not a name inside files/);
    expect(refused("files=a\\b.png")).toThrow(/not a name inside files/);
    expect(refused("files=missing.png")).toThrow(/files=missing.png is not among the site's files/);
    // A host that holds no files.
    expect(refused("files=photo.jpg", null)).toThrow(/files=photo.jpg is not among the site's files/);
    expect(refused("files=Main.qml", () => new Uint8Array([1]))).toThrow(/two blocks are both Main.qml/);
    expect(refused("file=Panel.qml group=g files=photo.jpg")).toThrow(/files= belongs on the example's root/);
    // A name is the file's however it is spelled: `./photo.jpg` is the
    // photo.jpg a request beside the file finds.
    const [dotted] = assemble(extractBlocks("```qml files=./photo.jpg,icons//ok.svg\nRectangle {}\n```\n"), { files }).examples;
    expect(Object.keys(dotted.given)).toEqual(["photo.jpg", "icons/ok.svg"]);
    expect(refused("files=photo.jpg,./photo.jpg")).toThrow(/two blocks are both photo.jpg/);
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
  // A width whose binding throws on purpose, read as the item is made:
  // what a handler throws is only told of (a test below), a throw while
  // the object is made fails it. It once was a string `states`, which
  // the runtime threw on until it read the type's own.
  const throwing = one(`import QtQuick

Item {
    height: 40
    width: { throw new Error("thrown on purpose") }
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
    // An older run's answer the manifest no longer names is dropped; a
    // file that is not a prerender's (a site's picture) is not its to drop.
    writeFileSync(join(cacheDir, "0123456789abcdef.html"), "an older runtime's");
    writeFileSync(join(cacheDir, "0123456789abcdef-0123456789ab.png"), "");
    // Cached: a second run makes nothing and answers the same manifest.
    const again = await renderPrerenders([counter], { cacheDir, qmlc });
    expect(again.failures).toEqual([]);
    expect(again.manifest[hashExample(counter)]).toEqual(manifest[hashExample(counter)]);
    expect(existsSync(join(cacheDir, "0123456789abcdef.html"))).toBe(false);
    expect(existsSync(join(cacheDir, manifest[hashExample(counter)].file))).toBe(true);
    expect(existsSync(join(cacheDir, "0123456789abcdef-0123456789ab.png"))).toBe(true);
    // An example the docs no longer have is no part of what is kept, a
    // prerender or a failure: it was made by this very stamp, and still
    // goes, with its file.
    expect(Object.keys(again.manifest)).toEqual([hashExample(counter)]);
    expect(existsSync(join(cacheDir, manifest[hashExample(implicit)].file))).toBe(false);
    pruneCache(cacheDir, { keep: new Set(), pattern: /^[0-9a-f]{16}-[0-9a-f]{12}\.png$/ });
    expect(existsSync(join(cacheDir, "0123456789abcdef-0123456789ab.png"))).toBe(false);
    expect(existsSync(join(cacheDir, "manifest.json"))).toBe(true);
    // A refusal that named no example is asked again, not served: the
    // example runs now, and its prerender takes the refusal's place.
    const kept = JSON.parse(readFileSync(join(cacheDir, "manifest.json"), "utf8"));
    const { stamp } = kept[hashExample(counter)];
    kept[hashExample(counter)] = { failed: true, diagnostics: ["the bundler ran out of files"], stamp, again: true };
    writeFileSync(join(cacheDir, "manifest.json"), JSON.stringify(kept));
    const asked = await renderPrerenders([counter], { cacheDir, qmlc });
    expect(asked.failures).toEqual([]);
    expect(loadPrerenders(cacheDir)[hashExample(counter)].html).toContain("Count: 0");
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

// A reader who asked for the dark scheme is first shown the example as
// it is made in the dark: one that paints from the palette paints its
// dark colours there, made by the same bundle a second time. Both are
// shown on one stage and drawn at one size, so that size is one both
// fit in.
plain("asked for the dark scheme too, each example is made in both, each from its own palette, at a size both fit in", async ({}, info) => {
  info.setTimeout(180_000);
  const one = (code) => assemble(extractBlocks("```qml\n" + code.trimEnd() + "\n```\n"), {}).examples[0];
  const painted = one(`import QtQuick

Rectangle {
    width: 40
    height: 40
    color: palette.window
}
`);
  const wider = one(`import QtQuick

Rectangle {
    readonly property bool dark: Qt.styleHints.colorScheme === Qt.ColorScheme.Dark
    width: dark ? 80 : 40
    height: dark ? 30 : 60
}
`);
  // Sized only in the dark: the light render has no size to give.
  const darkOnly = one(`import QtQuick

Rectangle {
    readonly property bool dark: Qt.styleHints.colorScheme === Qt.ColorScheme.Dark
    width: dark ? 400 : 0
    height: dark ? 30 : 0
}
`);
  const cacheDir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-codeblock-test-"));
  try {
    const { manifest, failures } = await renderPrerenders([painted, wider, darkOnly], { cacheDir, qmlc, dark: true });
    expect(failures).toEqual([]);
    expect(manifest[hashExample(painted)], "the same size in both").toMatchObject({ width: 40, height: 40 });
    expect(manifest[hashExample(wider)], "the dark's width and the light's height").toMatchObject({ width: 80, height: 60 });
    expect(manifest[hashExample(darkOnly)], "the dark's, as the light has none").toMatchObject({ width: 400, height: 30 });
    const { html, htmlDark } = loadPrerenders(cacheDir)[hashExample(painted)];
    expect(htmlDark).toBeDefined();
    // The rectangle's fill, as the prerender writes it.
    const lightness = (fragment) => {
      const [r, g, b] = /data-hk="[^"]*:Rectangle"[^>]*background: #(..)(..)(..);/
        .exec(fragment)
        .slice(1)
        .map((hex) => parseInt(hex, 16));
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    expect(lightness(html)).toBeGreaterThan(0.5);
    expect(lightness(htmlDark)).toBeLessThan(0.5);
    // Kept with the light one, and asked of the cache again only where
    // the dark one is missing.
    expect(manifest[hashExample(painted)].dark).toMatch(/^[0-9a-f]{16}-dark\.html$/);
    const again = await renderPrerenders([painted], { cacheDir, qmlc, dark: true });
    expect(again.manifest[hashExample(painted)]).toEqual(manifest[hashExample(painted)]);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

// The dark is a second making of the same example, and what it says
// there is said. What refuses only there has not failed as an example:
// its light render runs, and stays live; the dark window falls back to
// that light render, and the dark refusal is kept beside it, said to
// be the dark's, rather than taking the light one's place.
plain("what an example says only in the dark is its answer too, and what refuses only there keeps its light render", async ({}, info) => {
  info.setTimeout(180_000);
  const one = (code) => assemble(extractBlocks("```qml\n" + code.trimEnd() + "\n```\n"), {}).examples[0];
  const refusing = one(`import QtQuick

Rectangle {
    function side() {
        if (Qt.styleHints.colorScheme === Qt.ColorScheme.Dark)
            throw new Error("no side in the dark");
        return 40;
    }
    width: side()
    height: 40
}
`);
  const warning = one(`import QtQuick

Rectangle {
    width: 40
    height: 40
    Component.onCompleted: {
        console.warn("said in both");
        if (Qt.styleHints.colorScheme === Qt.ColorScheme.Dark)
            console.warn("said in the dark");
    }
}
`);
  const sibling = one(`import QtQuick

Rectangle {
    width: 40
    height: 40
    color: palette.window
}
`);
  const cacheDir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-codeblock-test-"));
  try {
    const examples = [refusing, warning, sibling];
    const { manifest, failures } = await renderPrerenders(examples, { cacheDir, qmlc, dark: true });
    expect(failures, "a dark-only refusal fails no example").toEqual([]);
    const made = manifest[hashExample(refusing)];
    expect(made.failed, "not an example-level failure").toBeUndefined();
    expect(existsSync(join(cacheDir, made.file)), "its light render is kept").toBe(true);
    expect(made.dark, "no dark render to show").toBeUndefined();
    expect(made).toMatchObject({ width: 40, height: 40 });
    const [first] = made.darkFailed;
    expect(first).toContain(`${refusing.entry}:1: in the dark scheme: `);
    expect(first).toContain("no side in the dark");
    // What the build embeds: the light render, live, and no dark one,
    // so the dark window draws the light one (pictures.mjs's fallback).
    const loaded = loadPrerenders(cacheDir)[hashExample(refusing)];
    expect(loaded.html).toContain("data-hk");
    expect(loaded.htmlDark).toBeUndefined();
    expect(loaded.darkFailed).toEqual(made.darkFailed);
    const beside = manifest[hashExample(sibling)];
    for (const file of [beside.file, beside.dark]) expect(existsSync(join(cacheDir, file)), file).toBe(true);
    expect.soft(manifest[hashExample(warning)].logged, "what it said in either scheme").toEqual(["said in both", "in the dark scheme: said in the dark"]);

    // Served, not made again: the second answer is the cache's own
    // words, and the cached dark refusal still excludes nothing.
    const kept = JSON.parse(readFileSync(join(cacheDir, "manifest.json"), "utf8"));
    kept[hashExample(refusing)].darkFailed = ["as the cache has it"];
    writeFileSync(join(cacheDir, "manifest.json"), JSON.stringify(kept));
    const again = await renderPrerenders(examples, { cacheDir, qmlc, dark: true });
    expect(again.failures).toEqual([]);
    expect(again.manifest[hashExample(refusing)]).toEqual({ ...made, darkFailed: ["as the cache has it"] });
    expect(loadPrerenders(cacheDir)[hashExample(refusing)].html).toContain("data-hk");
    expect(again.manifest[hashExample(sibling)]).toEqual(beside);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

// /quality/design-guardrails/'s two windows: a Pane and what is in it.
// The same Pane with no window round it tells the window's part from the
// Pane's, and each made alone tells the example's part from the batch's.
// Made after an example whose error halts Solid, nothing a window owes a
// later update arrives: so it is made behind two of those as well.
plain("what a root window's Pane holds is in its prerender, made alone or in a batch", async ({}, info) => {
  info.setTimeout(300_000);
  const one = (code) => assemble(extractBlocks("```qml\n" + code.trimEnd() + "\n```\n"), {}).examples[0];
  const examples = {
    centred: one(`import Ljos.Ui
import Ljos.Controls.Basic

ApplicationWindow {
    width: 400
    height: 240
    visible: true

    Pane {
        anchors.centerIn: parent
        Label {
            text: "Words in a centred pane"
        }
    }
}
`),
    filled: one(`import Ljos.Ui
import Ljos.Controls.Basic
import Ljos.Layout

ApplicationWindow {
    width: 360
    height: 120
    visible: true

    Pane {
        anchors.fill: parent
        Row {
            anchors.fill: parent
            Label {
                text: "Words in a filled pane"
            }
        }
    }
}
`),
    windowless: one(`import Ljos.Ui
import Ljos.Controls.Basic

Pane {
    width: 360
    height: 120
    Label {
        text: "Words in a pane with no window"
    }
}
`),
  };
  // /rust/multimedia/'s: its effect's throw is nobody's to catch here.
  const halting = (width) =>
    one(`import QtQuick
import QtMultimedia

Item {
    width: ${width}
    height: 240

    MediaPlayer {
        source: "clip.mp4"
        audioOutput: AudioOutput {}
        videoOutput: output
    }

    VideoOutput {
        id: output
        anchors.fill: parent
    }
}
`);
  const halts = { first: halting(320), second: halting(321) };
  const made = { ...examples, ...halts };
  const words = { centred: "Words in a centred pane", filled: "Words in a filled pane", windowless: "Words in a pane with no window" };
  const runs = [...Object.keys(examples).map((name) => [name]), Object.keys(examples), ["first", "centred", "second", "filled", "windowless"]];
  for (const names of runs) {
    const cacheDir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-codeblock-test-"));
    try {
      const { manifest, failures } = await renderPrerenders(names.map((name) => made[name]), { cacheDir, qmlc, dark: true });
      const stopping = names.filter((name) => name in halts);
      expect(failures.map(({ example }) => hashExample(example)).sort(), names.join()).toEqual(stopping.map((name) => hashExample(halts[name])).sort());
      // Where they no longer halt, this says nothing of what follows one.
      for (const { diagnostics } of failures) expect(diagnostics.join("\n")).toContain("REACTIVITY_HALTED");
      // The size the build reads from a real window's prerender, not a
      // hand-written one: the window's, so its picture isn't cut short.
      if (names.includes("centred")) expect(manifest[hashExample(examples.centred)], names.join()).toMatchObject({ width: 400, height: 240 });
      for (const name of names.filter((each) => each in examples))
        for (const scheme of ["file", "dark"])
          expect
            .soft(readFileSync(join(cacheDir, manifest[hashExample(examples[name])][scheme]), "utf8"), `${name} (${scheme}), made with ${names.join()}`)
            .toContain(words[name]);
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  }
});

// A batch of examples is one bundle: what the runtime lacks is told for
// all of them in it (`lacking`), where a stopped build names one a build
// and a batch of a dozen such examples is built a dozen times.
plain("the plugin tells each import the runtime lacks, and leaves it out, when asked to", async () => {
  const { default: qml } = await import("../vite.js");
  const context = {
    resolve: async () => null,
    error: (told) => {
      throw Object.assign(new Error(told.message), told);
    },
  };
  const importer = "/stage/examples/0123456789abcdef/Main.qml";
  // Not asked: the build stops at the first, naming the file that asked.
  await expect(qml({ qt: [], styles: "ljos" }).resolveId.call(context, "ljos-web/Nowhere", importer, {})).rejects.toMatchObject({
    message: "ljos-web/Nowhere is not in ljos-web: nothing resolves it",
    id: importer,
  });
  const told = [];
  const plugin = qml({ qt: [], styles: "ljos", lacking: (lack) => told.push(lack) });
  expect(await plugin.resolveId.call(context, "ljos-web/Nowhere", `${importer}?v=1`, {})).toEqual({ id: "ljos-web/Nowhere", external: true });
  expect(await plugin.resolveId.call(context, "ljos-web/Elsewhere", importer, {})).toEqual({ id: "ljos-web/Elsewhere", external: true });
  expect(told).toEqual([
    { source: "ljos-web/Nowhere", importer, why: "nothing resolves it" },
    { source: "ljos-web/Elsewhere", importer, why: "nothing resolves it" },
  ]);
});

// The other half of that: a batch whose examples lack imports is one
// bundle that names them all, each blamed on its own example, and one
// more bundle for the rest. Were the blame wrong (an importer the
// bundler names some other way than the stage's
// `examples/<16 hex>/`), the batch would still end up right, by
// halving, and only be slower: so the bundles are counted.
plain("a batch whose examples lack imports fails those, each with its own, and is bundled once more for the rest", async ({}, info) => {
  info.setTimeout(180_000);
  const lacking = (name) =>
    [
      `\`\`\`qml group=${name}`,
      'import QtQuick\nimport "helper.js" as Helper\n\nText { text: Helper.word() }',
      "```",
      "",
      `\`\`\`js file=helper.js group=${name}`,
      `import { pad } from "nowhere-${name}";\nexport function word() { return pad("${name}"); }`,
      "```",
      "",
    ].join("\n");
  const [first, second, fine] = assemble(extractBlocks([lacking("first"), lacking("second"), "```qml", 'import QtQuick\n\nText { text: "fine" }', "```", ""].join("\n")), {}).examples;
  const cacheDir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-codeblock-test-"));
  // Each bundle is a Node process of its own (`prerender-bundle.js`):
  // one line a start, written by a module every Node process the
  // prerender starts loads first.
  const counted = join(cacheDir, "bundles.txt");
  const counter = join(cacheDir, "count.mjs");
  writeFileSync(counter, `import { appendFileSync } from "node:fs";\nif (process.argv[1]?.endsWith("prerender-bundle.js")) appendFileSync(${JSON.stringify(counted)}, "bundle\\n");\n`);
  try {
    const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${counter}`.trim(), LJOS_PRERENDER_JOBS: "1" };
    const { failures } = await renderPrerenders([first, second, fine], { cacheDir, qmlc, env });
    const said = new Map(failures.map(({ example, diagnostics }) => [example, diagnostics.join("\n")]));
    expect(failures).toHaveLength(2);
    expect(said.has(first) && said.has(second)).toBe(true);
    expect(said.get(first)).toContain("nowhere-first is not in ljos-web");
    expect(said.get(first)).not.toContain("nowhere-second");
    expect(said.get(second)).toContain("nowhere-second is not in ljos-web");
    expect(said.get(second)).not.toContain("nowhere-first");
    expect(loadPrerenders(cacheDir)[hashExample(fine)].html).toContain("fine");
    // Once to find what all of them lack, once for the one that is left.
    expect(readFileSync(counted, "utf8").trim().split("\n")).toHaveLength(2);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

// The build reads the renderer's answers while it bundles the next
// batches, so it may read them late: an answer still on its way when
// the renderer ends is lost, and its example left plain as one that
// gave none. A slow reader still gets every one.
plain("a renderer's every answer reaches a reader that is late to read them", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-codeblock-test-"));
  try {
    // More than a pipe holds, so most of it is still unread at the end.
    writeFileSync(
      join(dir, "entries.mjs"),
      [
        `export const pages = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [String(i).padStart(16, "0"), () => null]));`,
        `export async function renderToString() { return "x".repeat(20_000); }`,
        `export const reactivityHalted = () => false;`,
      ].join("\n"),
    );
    const { spawn } = await import("node:child_process");
    const lines = await new Promise((done, failed) => {
      const child = spawn(process.execPath, [join(import.meta.dirname, "../codeblocks/prerender-run.js"), join(dir, "entries.mjs"), "{}"], { stdio: ["ignore", "pipe", "pipe"] });
      const out = [];
      // Late: not until the renderer has ended, or a while has passed
      // (a renderer that waits to be read never ends on its own).
      child.stdout.pause();
      let late = setTimeout(() => read(), 2_000);
      const read = () => {
        if (!late) return;
        clearTimeout(late);
        late = null;
        child.stdout.on("data", (chunk) => out.push(chunk));
        child.stdout.resume();
      };
      child.on("exit", read);
      child.on("error", failed);
      child.on("close", () => done(Buffer.concat(out).toString("utf8").split("\n").filter(Boolean)));
    });
    expect(lines.map((line) => JSON.parse(line).hash)).toEqual(Array.from({ length: 24 }, (_, i) => String(i).padStart(16, "0")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// What an example reads by a relative address is its own file, read
// from its own directory and nowhere else: an address that climbs out,
// as `../` or as `..%2F` (which the URL keeps and decoding makes `../`),
// is a file that is not there, though there is one at the place it names.
// An address from the page's root (`/own.json`) is the example's own
// file too, as the page stands at the prerender document's root; one
// that climbs from there is not let out by the root clamping it, and
// one whose name holds a colon is a name, not an address's scheme.
plain("a prerender's fetch reads the example's own files and nothing outside its directory", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-codeblock-test-"));
  try {
    const hash = "0123456789abcdef";
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, "server"));
    mkdirSync(join(dir, "examples", hash), { recursive: true });
    writeFileSync(join(dir, "examples", hash, "own.json"), "its own");
    writeFileSync(join(dir, "examples", hash, "data:own.json"), "its own, named with a colon");
    writeFileSync(join(dir, "examples", "beside.json"), "another's");
    writeFileSync(join(dir, "outside.json"), "the build's");
    const asked = [
      "own.json",
      "http://prerender.invalid/own.json",
      "..%2Fbeside.json",
      "..%2F..%2Foutside.json",
      "%2E%2E%2Fbeside.json",
      "http://prerender.invalid/..%2Fbeside.json",
      "../beside.json",
      "../../outside.json",
      "http://prerender.invalid/../beside.json",
      "/own.json",
      "/../beside.json",
      "/../../outside.json",
      "/%2e%2e/beside.json",
      "/..%2Fbeside.json",
      "/data:own.json",
    ];
    writeFileSync(
      join(dir, "server", "entries.mjs"),
      [
        `export const pages = { ${JSON.stringify(hash)}: () => null };`,
        `export async function renderToString() {`,
        `  const read = async (url) => { try { const r = await fetch(url); return [r.status, await r.text()]; } catch (e) { return ["threw", String(e)]; } };`,
        `  return JSON.stringify(await Promise.all(${JSON.stringify(asked)}.map(read)));`,
        `}`,
      ].join("\n"),
    );
    const { spawnSync } = await import("node:child_process");
    const run = spawnSync(process.execPath, [join(import.meta.dirname, "../codeblocks/prerender-run.js"), join(dir, "server", "entries.mjs"), "{}"], { encoding: "utf8" });
    const [{ html, error }] = run.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    expect(error, run.stderr).toBeUndefined();
    const got = Object.fromEntries(asked.map((url, i) => [url, JSON.parse(html)[i]]));
    expect(got).toEqual({
      "own.json": [200, "its own"],
      "http://prerender.invalid/own.json": [200, "its own"],
      "..%2Fbeside.json": [404, ""],
      "..%2F..%2Foutside.json": [404, ""],
      "%2E%2E%2Fbeside.json": [404, ""],
      "http://prerender.invalid/..%2Fbeside.json": [404, ""],
      "../beside.json": [404, ""],
      "../../outside.json": [404, ""],
      "http://prerender.invalid/../beside.json": [404, ""],
      "/own.json": [200, "its own"],
      "/../beside.json": [404, ""],
      "/../../outside.json": [404, ""],
      "/%2e%2e/beside.json": [404, ""],
      "/..%2Fbeside.json": [404, ""],
      "/data:own.json": [200, "its own, named with a colon"],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

plain("a film is prerendered unplayed, and the example after it is made", async ({}, info) => {
  info.setTimeout(180_000);
  const one = (code) => assemble(extractBlocks("```qml\n" + code.trimEnd() + "\n```\n"), {}).examples[0];
  const film = (extra) =>
    one(`import QtQuick
import QtMultimedia

Item {
    width: 320
    height: 240
    Text { text: "The film" }
    MediaPlayer {
        audioOutput: AudioOutput {}
        videoOutput: output
        ${extra}
    }
    VideoOutput {
        id: output
        anchors.fill: parent
    }
}
`);
  // No source is a load at once, `autoPlay` a play, and every player is
  // paused and loaded again as its example is taken down.
  const empty = film("loops: 2");
  const named = film('source: "clip.mp4"');
  const playing = film('source: "clip.mp4"; autoPlay: true');
  const after = one(`import QtQuick

Text { text: "After the film" }
`);
  const cacheDir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-codeblock-test-"));
  try {
    const { failures } = await renderPrerenders([empty, named, playing, after], { cacheDir, qmlc });
    expect(failures.map(({ diagnostics }) => diagnostics.join("\n"))).toEqual([]);
    const loaded = loadPrerenders(cacheDir);
    for (const example of [empty, named, playing]) expect(loaded[hashExample(example)].html).toContain("The film");
    expect(loaded[hashExample(after)].html).toContain("After the film");
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

plain("a prerender stands where a page stands: a Request is beside it, and a handler's throw is told of", async ({}, info) => {
  info.setTimeout(180_000);
  const one = (code) => assemble(extractBlocks("```qml\n" + code.trimEnd() + "\n```\n"), {}).examples[0];
  // A relative address is read against the document, as a browser
  // reads it, not refused for want of a base.
  const request = one(`import Ljos.Ui
import Ljos.Core

Text {
    id: root
    text: ""
    Component.onCompleted: {
        const asked = new Request("names", { method: "POST" })
        root.text = \`\${asked.method} \${new URL(asked.url).pathname}\`
    }
}
`);
  // What a handler throws stops that handler only: the example is
  // made, as on a page, where the throw is reported.
  const throwing = one(`import Ljos.Ui

Text {
    id: root
    text: "made"
    Component.onCompleted: {
        root.text = "made anyway"
        throw new Error("told of")
    }
}
`);
  const cacheDir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-codeblock-test-"));
  try {
    const { failures } = await renderPrerenders([request, throwing], { cacheDir, qmlc });
    expect(failures.map(({ diagnostics }) => diagnostics.join("\n"))).toEqual([]);
    const loaded = loadPrerenders(cacheDir);
    expect(loaded[hashExample(request)].html).toContain("POST /names");
    expect(loaded[hashExample(throwing)].html).toContain("made anyway");
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

// There is no server to ask while a page is made: the picture is the
// example as it is before any response, which the browser then asks for.
plain("a prerender's request opens, is sent and is aborted, and never completes", async ({}, info) => {
  info.setTimeout(180_000);
  const one = (code) => assemble(extractBlocks("```qml\n" + code.trimEnd() + "\n```\n"), {}).examples[0];
  const waiting = one(`import Ljos.Ui
import Ljos.Core

Text {
    id: root
    text: "before a response"
    Component.onCompleted: {
        const http = new XMLHttpRequest()
        http.onreadystatechange = function () {
            root.text = \`seen \${http.readyState} of \${XMLHttpRequest.DONE}\`
        }
        http.open("GET", "https://example.invalid/act.json", true)
        http.setRequestHeader("Content-type", "application/json")
        http.send()
    }
}
`);
  // The handler is called as the event is dispatched, as a page's is:
  // what it reads of the event is the request it was set on.
  const targeted = one(`import Ljos.Ui
import Ljos.Core

Text {
    id: root
    text: "before a response"
    Component.onCompleted: {
        const http = new XMLHttpRequest()
        http.onreadystatechange = function (event) {
            root.text = \`handler saw \${event.target.readyState}, on its request \${event.target === http && event.currentTarget === http}\`
        }
        http.open("GET", "https://example.invalid/act.json", true)
        http.send()
    }
}
`);
  const aborted = one(`import Ljos.Ui
import Ljos.Core

Text {
    id: root
    text: ""
    Component.onCompleted: {
        const http = new XMLHttpRequest()
        http.open("GET", "names.json")
        http.send()
        const sent = http.readyState
        http.abort()
        root.text = \`sent at \${sent}, aborted to \${http.readyState}, answered \${http.status}\`
    }
}
`);
  const cacheDir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-codeblock-test-"));
  try {
    const { failures } = await renderPrerenders([waiting, aborted, targeted], { cacheDir, qmlc });
    expect(failures.map(({ diagnostics }) => diagnostics.join("\n"))).toEqual([]);
    const loaded = loadPrerenders(cacheDir);
    expect(loaded[hashExample(waiting)].html).toContain("seen 1 of 4");
    expect(loaded[hashExample(aborted)].html).toContain("sent at 1, aborted to 0, answered 0");
    expect(loaded[hashExample(targeted)].html).toContain("handler saw 1, on its request true");
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

// A script's fetch of a file the example gives, by the relative address
// the docs' threads example uses, is on its way when the page settles:
// the picture is the example before the reply, as for any request. It
// once matched none of the example's files, was answered 404 at once,
// and the picture said 404.
plain("a prerender's fetch of the example's own file is on its way, not refused", async ({}, info) => {
  info.setTimeout(180_000);
  const [reading] = assemble(
    extractBlocks(`\`\`\`qml group=reply
import Ljos.Ui
import Ljos.Core

Text {
    id: root
    property string got: ""
    text: got === "" ? "before a reply" : got

    Component.onCompleted: {
        const read = async (): Promise<void> => {
            const reply = await fetch("reply.json")
            root.got = reply.ok ? "replied" : \`refused \${reply.status}\`
        }
        read()
    }
}
\`\`\`

\`\`\`json file=reply.json group=reply
{"said": "beside the page"}
\`\`\`
`),
    {},
  ).examples;
  const cacheDir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-codeblock-test-"));
  try {
    const { failures } = await renderPrerenders([reading], { cacheDir, qmlc });
    expect(failures.map(({ diagnostics }) => diagnostics.join("\n"))).toEqual([]);
    const { html } = loadPrerenders(cacheDir)[hashExample(reading)];
    expect(html).toContain("before a reply");
    expect(html).not.toContain("refused");
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

// A prerender is made by the compiler's bytes as they are now, and by
// the 3D renderer the build asks for: a compiler rebuilt where the old
// one stood, or another renderer, is another stamp.
plain("a prerender's stamp answers for the compiler's bytes now and the 3D renderer", () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-codeblock-stamp-"));
  try {
    const compiler = join(dir, "qmlc");
    writeFileSync(compiler, "one");
    const first = prerenderStamp({ qmlc: compiler, env: {} });
    expect(prerenderStamp({ qmlc: compiler, env: {} })).toBe(first);
    expect(prerenderStamp({ qmlc: compiler, env: { VITE_LJOS_VIEW3D: "wgpu" } })).not.toBe(first);
    expect(prerenderStamp({ qmlc: compiler, dark: true, env: {} })).not.toBe(first);
    writeFileSync(compiler, "two");
    expect(prerenderStamp({ qmlc: compiler, env: {} })).not.toBe(first);
  } finally {
    rmSync(dir, { recursive: true, force: true });
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

  // A build's check runs several compilers at once and asks once about
  // an example shown twice: its answer is still one at a time's, in
  // the examples' order, a copy's failure said for each place it stands.
  plain("a build's check, several at once, answers as one at a time does", async () => {
    const { examples } = assemble(extractBlocks(DOC), { harnesses: { window: WINDOW } });
    const broken = structuredClone(examples[0]);
    broken.display[0].code = broken.display[0].code.replace("width: 320", "width: 320 +");
    const asked = [broken, ...examples, structuredClone(broken)];
    const together = await checkExamplesAll(asked, { qmlc, jobs: 3 });
    expect(together.map(({ example }) => example)).toEqual([asked[0], asked.at(-1)]);
    expect(together.map(({ diagnostics }) => diagnostics)).toEqual(checkExamples(asked, { qmlc }).map(({ diagnostics }) => diagnostics));
    expect(together[0].diagnostics.join("\n")).toMatch(/Main\.qml:\d+/);
    const missing = await checkExamplesAll([examples[0]], { qmlc: "/nowhere/qmlc" });
    expect(missing[0].diagnostics[0]).toMatch(/the compiler could not be run/);
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

plain("a root window's prerender is as large as the window asked", () => {
  const window = (content) =>
    `<div class="qq-window" data-hk="1:ApplicationWindow" style="top: 0; left: 0; height: 100%; width: 100%;"><div class="qq" data-hk="2:Item" style="transform: translate(0px,0px); ${content}"></div></div>`;
  expect(prerenderSize(window("width: 400px; height: 260px;"))).toEqual({ width: 400, height: 260 });
  // Only a window's: an item that says no size doesn't take its child's.
  const item = '<div class="qq" data-hk="1:Item" style="width: 100%;"><div class="qq" data-hk="2:Item" style="width: 40px; height: 30px;"></div></div>';
  expect(prerenderSize(item)).toEqual({});
  // Something a window makes before its content item doesn't hide it,
  // nor does an Item inside that something.
  const before =
    '<div class="qq" data-hk="2:Rectangle" style="width: 10px; height: 10px;"><img src="a.png"><div class="qq" data-hk="3:Item" style="width: 20px; height: 20px;"></div></div><!-- <b> -->';
  const backed = `<div class="qq-window" data-hk="1:ApplicationWindow" style="height: 100%; width: 100%;">${before}<div class="qq" data-hk="4:Item" style="width: 400px; height: 260px;"></div></div>`;
  expect(prerenderSize(backed)).toEqual({ width: 400, height: 260 });
  // Only the window's own children: an Item after the window isn't its.
  expect(prerenderSize(`<div class="qq-window" data-hk="1:Window" style="width: 100%;"></div><div class="qq" data-hk="2:Item" style="width: 5px; height: 5px;"></div>`)).toEqual({});
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

  // A browser without WebAssembly has no compiler: there is no other one,
  // so the block keeps what the build made and says why it is not live.
  test("without WebAssembly a block keeps its prerendered result and says live editing needs it", async ({ page }) => {
    const fetched = [];
    page.on("request", (request) => {
      if (/ljos_web_compiler\.wasm/.test(request.url())) fetched.push(request.url());
    });
    await page.addInitScript(() => delete globalThis.WebAssembly);
    await opened(page);
    const figure = counterFigure(page);
    await figure.scrollIntoViewIfNeeded();
    await expect(figure).toHaveAttribute("data-state", "needs-wasm");
    await expect(figure.getByRole("note")).toHaveText(/^Live editing needs WebAssembly/);
    await expect(figure.locator(".ljos-codeblock__stage")).toContainText("Count: 0");
    await expect(figure.locator("pre code")).toContainText("Count: ");
    await expect(figure.locator(".cm-editor, [contenteditable]")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(fetched).toEqual([]);
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
  // The code is swapped for its editor once the page is idle, so a read
  // can land on the one just taken out; that one is read again.
  await expect
    .poll(() => figure.locator("pre.ljos-code, .ljos-codeblock__editor").first().evaluate((el) => (el.isConnected ? parseFloat(getComputedStyle(el).fontSize) : "taken out as it was read")), {
      message: "the code's font size",
    })
    .toBeGreaterThanOrEqual(16);
  const editor = await editorOf(figure, /Main\.qml/);
  expect(parseFloat(await editor.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await editor.locator(".cm-line").nth(2).tap();
  await expect(editor).toBeFocused();
  for (const at of await page.locator("[data-ljos-codeblock]").all()) await at.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await context.close();
});
