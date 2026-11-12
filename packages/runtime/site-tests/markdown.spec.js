// A Markdown content source for a site: the pages of a directory of
// Markdown become the blocks a page shows, with their routes, their
// order and their headings, before any page is built. These hold the
// reading to what the Markdown says; the built site is held elsewhere.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { highlight, inline, markdownBlocks, parseFrontMatter, readMarkdownSite } from "../markdown.js";

test("front matter gives the title, description, section and order, and the body keeps its first heading out", () => {
  const { front, body } = parseFrontMatter("---\ntitle: What is Ljós?\ndescription: A toolkit.\nsection: start\norder: 1\n---\n\n# What is Ljós?\n\nText.\n");
  expect(front).toEqual({ title: "What is Ljós?", description: "A toolkit.", section: "start", order: 1 });
  expect(body.startsWith("# What is Ljós?")).toBe(true);
});

test("headings carry their level, their plain words and the anchor a reader links to", () => {
  const blocks = markdownBlocks("## Two servers, one model\n\nBody.\n\n### The authoring server (`ljos mcp`)\n");
  expect(blocks[0]).toMatchObject({ kind: "heading", level: 2, plain: "Two servers, one model", anchor: "two-servers-one-model" });
  expect(blocks[2]).toMatchObject({ kind: "heading", level: 3, plain: "The authoring server (ljos mcp)", anchor: "the-authoring-server-ljos-mcp" });
});

test("a paragraph's inline code, weight and link survive as rich text, and a .md link becomes its route", () => {
  const rich = inline("Use `ljos check`, **before** you [start](../start/first-app.md#run) or [leave](https://example.com).", {
    routeOf: (href) => (href.endsWith("first-app.md#run") ? "/start/first-app/#run" : href),
  });
  expect(rich).toContain("<code>ljos check</code>");
  expect(rich).toContain("<b>before</b>");
  expect(rich).toContain('<a href="/start/first-app/#run">start</a>');
  expect(rich).toContain('<a href="https://example.com">leave</a>');
  // What the Markdown wrote as a less-than is text, never markup.
  expect(inline("a < b & <c>")).toBe("a &lt; b &amp; &lt;c&gt;");
});

test("lists, tables, quotes, rules and pictures are blocks of their own", () => {
  const blocks = markdownBlocks("- one\n- two `x`\n\n1. first\n2. second\n\n| A | B |\n|---|---|\n| 1 | `y` |\n\n> [!NOTE]\n> Mind this.\n\n---\n\n![A chart](chart.png)\n");
  expect(blocks.map((block) => block.kind)).toEqual(["list", "list", "table", "quote", "rule", "image"]);
  expect(blocks[0]).toMatchObject({ ordered: false });
  expect(blocks[0].items[1]).toContain("<code>x</code>");
  expect(blocks[1].ordered).toBe(true);
  expect(blocks[2].head).toEqual(["A", "B"]);
  expect(blocks[2].rows[0][1]).toContain("<code>y</code>");
  expect(blocks[3]).toMatchObject({ note: "note" });
  expect(blocks[3].rich).toContain("Mind this.");
  expect(blocks[5]).toMatchObject({ src: "chart.png", alt: "A chart" });
});

test("a fenced block keeps its fence contract and its code, highlighted", () => {
  const blocks = markdownBlocks("```qml harness=window\nText { text: \"hi\" } // say it\n```\n\n```sh\nljos check .\n```\n");
  expect(blocks[0]).toMatchObject({ kind: "code", lang: "qml", harness: "window", code: 'Text { text: "hi" } // say it\n' });
  expect(blocks[0].rich).toContain("&quot;hi&quot;");
  expect(blocks[0].rich).toContain("<span");
  expect(blocks[1]).toMatchObject({ kind: "code", lang: "sh" });
  expect(highlight("a < b", "text")).not.toContain("< b");
});

test("highlighting never colours inside a string, a number, or its own markup", () => {
  const rich = highlight('color: "#9a6a00" // return 42', "qml");
  expect(rich).not.toContain('style="<span');
  expect(rich).toContain("&quot;#9a6a00&quot;");
  expect(rich.match(/<span/g).length).toBeLessThanOrEqual(3);
});

test("a table's cells are split outside code spans, and an escaped pipe is a pipe", () => {
  // As the docs themselves write one (quality/layout-and-typography):
  // a cell whose code span holds a `|`.
  const blocks = markdownBlocks("| Glyph | Name | Where |\n|---|---|---|\n| (`·`, `|`, `ToolSeparator`) | bar \\| baz | here |\n");
  expect(blocks[0].head).toEqual(["Glyph", "Name", "Where"]);
  expect(blocks[0].rows).toHaveLength(1);
  expect(blocks[0].rows[0]).toHaveLength(3);
  expect(blocks[0].rows[0][0]).toContain("<code>|</code>");
  expect(blocks[0].rows[0][0]).toContain("<code>ToolSeparator</code>");
  expect(blocks[0].rows[0][1]).toBe("bar | baz");
});

test("backtick runs pair as runs: a lone backtick is text, a double span holds its pipe", () => {
  const lone = markdownBlocks("| A | B |\n|---|---|\n| it`s | x |\n");
  expect(lone[0].rows[0]).toHaveLength(2);
  expect(lone[0].rows[0][0]).toContain("it`s");
  const doubled = markdownBlocks("| A | B |\n|---|---|\n| ``a|b`` | y |\n");
  expect(doubled[0].rows[0]).toHaveLength(2);
  expect(doubled[0].rows[0][0]).toContain("<code>a|b</code>");
  expect(inline("a ``b`c`` d")).toContain("<code>b`c</code>");
  // Padding is how a span holds a backtick: one space comes off
  // each end when both ends have one and the span is not all spaces.
  expect(inline("`` ` ``")).toBe("<code>`</code>");
  expect(inline("``  ``")).toBe("<code>  </code>");
  const padded = markdownBlocks("| A | B |\n|---|---|\n| `` ` `` | q |\n");
  expect(padded[0].rows[0][0]).toContain("<code>`</code>");
});

test("a heading's own trailing hash is its word, not a closing sequence", () => {
  const blocks = markdownBlocks("## Using C#\n\n## Closed ##\n");
  expect(blocks[0]).toMatchObject({ plain: "Using C#", anchor: "using-c" });
  expect(blocks[1]).toMatchObject({ plain: "Closed", anchor: "closed" });
});

test("emphasis is never written inside a link's address", () => {
  expect(inline("[star](https://example.com/a*b_c)")).toBe('<a href="https://example.com/a*b_c">star</a>');
});

test("an HTML comment in the prose is the writer's note, not the reader's text", () => {
  const blocks = markdownBlocks("Before.\n\n<!-- check: verify this before publishing -->\n\nAfter <!-- inline note --> words.\n");
  const words = JSON.stringify(blocks);
  expect(words).not.toContain("check: verify");
  expect(words).not.toContain("inline note");
  expect(blocks.at(-1).rich).toContain("After");
});

test("a directory of pages reads as routes in sidebar order, with each page's headings", () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-markdown-"));
  try {
    mkdirSync(join(dir, "start"));
    mkdirSync(join(dir, "ui"));
    writeFileSync(join(dir, "start", "index.md"), "---\ntitle: What is Ljós?\ndescription: D.\nsection: start\norder: 1\n---\n\n# What is Ljós?\n\n## Overview\n\nSee [the first app](first-app.md) and [items](../ui/items.md).\n");
    writeFileSync(join(dir, "start", "first-app.md"), "---\ntitle: Your first app\ndescription: D.\nsection: start\norder: 2\n---\n\n# Your first app\n\nBack to [the start](index.md).\n");
    writeFileSync(join(dir, "ui", "items.md"), "---\ntitle: Items\ndescription: D.\nsection: ui\norder: 1\n---\n\n# Items\n");
    const site = readMarkdownSite({ dir, sections: [{ id: "start", label: "Start" }, { id: "ui", label: "User interface" }] });
    expect(site.pages.map((page) => page.route)).toEqual(["/start/", "/start/first-app/", "/ui/items/"]);
    expect(site.sidebar).toEqual([
      { label: "Start", pages: [{ route: "/start/", title: "What is Ljós?" }, { route: "/start/first-app/", title: "Your first app" }] },
      { label: "User interface", pages: [{ route: "/ui/items/", title: "Items" }] },
    ]);
    const first = site.pages[0];
    expect(first.title).toBe("What is Ljós?");
    // The body's own first heading is the title the shell shows: not a block.
    expect(first.blocks.some((block) => block.kind === "heading" && block.level === 1)).toBe(false);
    expect(first.headings).toEqual([{ level: 2, plain: "Overview", anchor: "overview" }]);
    const prose = first.blocks.find((block) => block.kind === "para");
    expect(prose.rich).toContain('<a href="/start/first-app/">the first app</a>');
    expect(prose.rich).toContain('<a href="/ui/items/">items</a>');
    expect(site.pages[1].blocks.find((block) => block.kind === "para").rich).toContain('<a href="/start/">the start</a>');
    // Every internal link the reading made names a page it made.
    const routes = new Set(site.pages.map((page) => page.route));
    for (const page of site.pages) {
      for (const block of page.blocks) {
        for (const [, href] of JSON.stringify(block).matchAll(/<a href=\\"(\/[^"#\\]*)/g)) expect(routes.has(href), `${page.route} links ${href}`).toBe(true);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
