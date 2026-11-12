// A Markdown content source for a site: a directory of Markdown pages
// becomes the blocks a page shows, with each page's route, title,
// sidebar place and headings, for whatever shell a site wraps them in.
// Nothing here builds, fetches or draws: the reading is the same at
// build time in Node as anywhere else, so a site writes the pages this
// gives into its bundle (as data its shell reads) and holds the
// reading apart from the building.
//
// A page is front matter (`title`, `description`, `section`, `order`)
// over a body whose first `#` heading repeats the title and is the
// shell's to show, not a block. Inline words become the rich subset
// this runtime's `Text` takes (docs/LJOS_WEB.md: bold, italic, code,
// links, coloured spans), with the Markdown's own characters escaped
// first, so what a page wrote as text stays text. A fenced block keeps
// its fence contract (`harness=`, `file=`, `group=`, `before`, as the
// live code blocks read it) and its code; its `rich` is the code
// coloured for a reader whose page has not made the block live yet.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const escapeHtml = (text) =>
  String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// What a heading is linked to as: its words, lowered, one dash between
// them, as a reader's browser and a docs host both make it.
export function anchorOf(plain) {
  const anchor = String(plain)
    .toLowerCase()
    .replace(/[`.()[\]{}:;!?'"“”‘’/\\|,<>@#$%^&*+=~]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return anchor || "section";
}

// The plain words of inline Markdown: its marks taken away, for a
// heading's anchor and a contents list.
function plainOf(text) {
  return String(text)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\*([^*]*)\*/g, "$1")
    .replace(/__([^_]*)__/g, "$1")
    .replace(/_([^_]*)_/g, "$1")
    .trim();
}

// One run of prose as the rich text a `Text` shows. `routeOf(href)`
// rewrites a link's address (a `.md` link to its page's route); the
// address it returns is written escaped.
export function inline(text, { routeOf = (href) => href } = {}) {
  const code = [];
  let out = "";
  // Code first, by token, so its words take no other mark.
  const parts = String(text).split(/`([^`]*)`/g);
  for (let index = 0; index < parts.length; index++) {
    if (index % 2 === 1) {
      code.push(`<code>${escapeHtml(parts[index])}</code>`);
      out += `\u0000${code.length - 1}\u0000`;
    } else {
      out += parts[index];
    }
  }
  out = escapeHtml(out);
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_all, alt, src) => `<img src="${escapeHtml(routeOf(htmlUnescape(src)))}" alt="${alt}">`);
  out = out.replace(/\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_all, label, href) => `<a href="${escapeHtml(routeOf(htmlUnescape(href)))}">${label}</a>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/__([^_]+)__/g, "<b>$1</b>");
  out = out.replace(/\*([^*]+)\*/g, "<i>$1</i>").replace(/(^|[\s(])_([^_]+)_(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>");
  out = out.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  return out.replace(/\u0000(\d+)\u0000/g, (_all, at) => code[Number(at)]);
}

function htmlUnescape(text) {
  return String(text).replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

const KEYWORDS = new Set(
  ("import from as property readonly required signal function return if else for while var let const new true false null undefined this " +
    "int real bool string color url void enum type interface export default class extends async await of in " +
    "fn pub struct impl use mut match").split(" "),
);

// The code of a block, coloured for reading: comments dimmed, strings
// warmed, the language's own words weighted. The colouring is of the
// code's characters only — escaped first, whole tokens after — so it
// can never make markup of them.
// One stretch of code outside any string: its numbers and the
// language's own words coloured, the rest as it is, escaped first.
function colourPlain(text) {
  return escapeHtml(text)
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:#7a3e9d">$1</span>')
    .replace(/\b([A-Za-z_][\w]*)\b/g, (word) => (KEYWORDS.has(word) ? `<span style="color:#0b5cad"><b>${word}</b></span>` : word));
}

export function highlight(code, _lang) {
  return String(code)
    .split("\n")
    .map((line) => {
      const comment = line.indexOf("//");
      const shell = /^\s*#/.test(line) && comment < 0 ? 0 : -1;
      const at = shell === 0 ? 0 : comment;
      const [head, tail] = at >= 0 && !inString(line, at) ? [line.slice(0, at), line.slice(at)] : [line, ""];
      // Strings are tokens of their own, coloured whole: nothing
      // inside one — a word, a number, the colouring's own markup —
      // is coloured again.
      const coloured = head
        .split(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g)
        .map((part, index) => (index % 2 === 1 ? `<span style="color:#9a6a00">${escapeHtml(part)}</span>` : colourPlain(part)))
        .join("");
      return tail ? `${coloured}<span style="color:#6a737d">${escapeHtml(tail)}</span>` : coloured;
    })
    .join("\n");
}

function inString(line, at) {
  let quote = null;
  for (let index = 0; index < at; index++) {
    const char = line[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
  }
  return quote !== null;
}

// `qml harness=window` to the fields the fence contract keeps.
function fenceInfo(info) {
  const [lang = "", ...rest] = String(info ?? "").trim().split(/\s+/).filter(Boolean);
  const parsed = { lang: lang.toLowerCase() };
  for (const token of rest) {
    if (token === "before") parsed.before = true;
    else if (/^[\w-]+=[^\s]+$/.test(token)) {
      const at = token.indexOf("=");
      const key = token.slice(0, at);
      if (["harness", "file", "group"].includes(key)) parsed[key] = token.slice(at + 1);
    }
  }
  return parsed;
}

// A page's front matter and what follows it. A page with none is all
// body; a malformed one is said, not guessed at.
export function parseFrontMatter(text) {
  const said = String(text);
  if (!said.startsWith("---\n")) return { front: {}, body: said };
  const end = said.indexOf("\n---", 4);
  if (end < 0) throw new Error("front matter opens with --- and never closes");
  const front = {};
  for (const line of said.slice(4, end).split("\n")) {
    const field = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!field) continue;
    const [, key, raw] = field;
    const value = raw.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    front[key] = key === "order" ? Number(value) : value;
  }
  const rest = said.slice(end + 4);
  return { front, body: rest.startsWith("\n") ? rest.slice(1).replace(/^\n/, "") : rest.replace(/^\n/, "") };
}

const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line);
// A row's cells: split on the pipes between cells, never on one in
// a code span or written `\|` — the docs write both (a cell whose
// code is `|` itself).
function cellsOf(line) {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let cell = "";
  let code = false;
  for (let at = 0; at < inner.length; at++) {
    const char = inner[at];
    if (char === "`") code = !code;
    if (char === "\\" && inner[at + 1] === "|") {
      cell += "|";
      at++;
    } else if (char === "|" && !code) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}
const isDivider = (line) => isTableRow(line) && cellsOf(line).every((cell) => /^:?-{2,}:?$/.test(cell));

// A Markdown body as the blocks a page shows, in order. `routeOf`
// rewrites link addresses as `inline` does.
export function markdownBlocks(markdown, { routeOf = (href) => href } = {}) {
  const rich = (text) => inline(text, { routeOf });
  const blocks = [];
  // An HTML comment is the writer's note to themselves (the docs
  // carry `<!-- check: … -->` of them): no reader is shown it, as
  // no Markdown renderer shows it. A fence's own words are code,
  // untouched: comments go only where prose is read.
  const lines = [];
  {
    let fenced = false;
    let commented = false;
    for (const raw of String(markdown).split("\n")) {
      if (/^\s*(`{3,}|~{3,})/.test(raw)) fenced = !fenced;
      if (fenced || /^\s*(`{3,}|~{3,})/.test(raw)) {
        lines.push(raw);
        continue;
      }
      let line = raw;
      if (commented) {
        const end = line.indexOf("-->");
        if (end < 0) continue;
        line = line.slice(end + 3);
        commented = false;
      }
      line = line.replace(/<!--[\s\S]*?-->/g, " ");
      const open = line.indexOf("<!--");
      if (open >= 0) {
        line = line.slice(0, open);
        commented = true;
      }
      lines.push(line);
    }
  }
  let index = 0;
  const anchors = new Map();
  const anchorFor = (plain) => {
    const base = anchorOf(plain);
    const seen = anchors.get(base) ?? 0;
    anchors.set(base, seen + 1);
    return seen ? `${base}-${seen}` : base;
  };
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index++;
      continue;
    }
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      const info = fenceInfo(fence[2]);
      const at = index + 1;
      const code = [];
      index++;
      while (index < lines.length && !new RegExp(`^\\s*${fence[1][0]}{3,}\\s*$`).test(lines[index])) code.push(lines[index++]);
      index++; // the closing fence, or past the end
      const text = `${code.join("\n")}\n`;
      blocks.push({ kind: "code", ...info, code: text, line: at, rich: highlight(text.replace(/\n$/, ""), info.lang) });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line);
    if (heading) {
      const plain = plainOf(heading[2]);
      blocks.push({ kind: "heading", level: heading[1].length, plain, anchor: anchorFor(plain), rich: rich(heading[2]) });
      index++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      index++;
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quoted = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) quoted.push(lines[index++].replace(/^\s*>\s?/, ""));
      const note = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i.exec(quoted[0]?.trim() ?? "");
      if (note) quoted.shift();
      blocks.push({ kind: "quote", ...(note ? { note: note[1].toLowerCase() } : {}), rich: rich(quoted.join(" ").trim()) });
      continue;
    }
    if (isTableRow(line) && index + 1 < lines.length && isDivider(lines[index + 1])) {
      const head = cellsOf(line).map(rich);
      index += 2;
      const rows = [];
      while (index < lines.length && isTableRow(lines[index])) rows.push(cellsOf(lines[index++]).map(rich));
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      const ordered = /\d/.test(item[2]);
      const items = [];
      while (index < lines.length) {
        const next = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[index]);
        if (!next) break;
        let words = next[3];
        index++;
        while (index < lines.length && lines[index].trim() && !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[index]) && !/^(#{1,6})\s/.test(lines[index])) {
          words += ` ${lines[index].trim()}`;
          index++;
        }
        items.push(rich(words.replace(/^\[[ xX]\]\s+/, "")));
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const image = /^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)\s*$/.exec(line.trim());
    if (image) {
      blocks.push({ kind: "image", src: routeOf(image[2]), alt: plainOf(image[1]) });
      index++;
      continue;
    }
    // A paragraph: until a blank line or a block of another kind.
    const words = [line.trim()];
    index++;
    while (index < lines.length && lines[index].trim() && !/^(#{1,6})\s+/.test(lines[index]) && !/^\s*(`{3,}|~{3,})/.test(lines[index]) && !/^\s*>\s?/.test(lines[index]) && !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[index]) && !(isTableRow(lines[index]) && index + 1 < lines.length && isDivider(lines[index + 1]))) {
      words.push(lines[index].trim());
      index++;
    }
    blocks.push({ kind: "para", rich: rich(words.join(" ")) });
  }
  return blocks;
}

// Where a `.md` link written in `section` lands: the route of the page
// it names, with its `#` part kept; `index` is its section's own page.
// Any other address is the writer's, as written.
function routeFor(section) {
  return (href) => {
    const said = String(href);
    const at = said.indexOf("#");
    const [path, hash] = at >= 0 ? [said.slice(0, at), said.slice(at)] : [said, ""];
    if (!path.endsWith(".md")) return said;
    const parts = path.replace(/\.md$/, "").split("/").filter((part) => part && part !== ".");
    const slug = parts.pop();
    const dirs = parts.filter((part) => part !== "..");
    const target = dirs.length ? dirs[dirs.length - 1] : section;
    return `${slug === "index" ? `/${target}/` : `/${target}/${slug}/`}${hash}`;
  };
}

// A directory of Markdown as a site's pages: every `<section>/*.md`,
// in front-matter order within its section (then by slug), with the
// sidebar those orders make. `sections` names the sections and the
// words a sidebar shows for each. A section the directory has none of
// is left out, not shown empty.
export function readMarkdownSite({ dir, sections }) {
  const pages = [];
  const sidebar = [];
  for (const { id, label } of sections) {
    const at = join(dir, id);
    if (!existsSync(at)) continue;
    const inSection = [];
    for (const file of readdirSync(at).filter((name) => name.endsWith(".md")).sort()) {
      const { front, body } = parseFrontMatter(readFileSync(join(at, file), "utf8"));
      const slug = file.slice(0, -3);
      const route = slug === "index" ? `/${id}/` : `/${id}/${slug}/`;
      // The body's first `#` repeats the title, as a page a person
      // reads plain needs it: the shell shows the title, so the block
      // would say it twice.
      const blocks = markdownBlocks(body, { routeOf: routeFor(id) }).filter((block, at) => !(at === 0 && block.kind === "heading" && block.level === 1));
      const page = {
        route,
        section: id,
        slug,
        title: front.title ?? slug,
        description: front.description ?? "",
        order: front.order ?? 0,
        headings: blocks.filter((block) => block.kind === "heading").map(({ level, plain, anchor }) => ({ level, plain, anchor })),
        blocks,
      };
      inSection.push(page);
      pages.push(page);
    }
    inSection.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
    pages.sort((a, b) => sections.findIndex((section) => section.id === a.section) - sections.findIndex((section) => section.id === b.section) || a.order - b.order || a.slug.localeCompare(b.slug));
    if (inSection.length) sidebar.push({ label, pages: inSection.map(({ route, title }) => ({ route, title })) });
  }
  return { pages, sidebar };
}
