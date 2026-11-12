// The Markdown step: a remark plugin that turns every runnable fence
// of a document into the static half of a live code block, and holds
// the fences that claim to run to compiling. It works on the mdast a
// host hands it (Astro/Starlight, or any unified pipeline) and needs
// nothing of the host but the tree: exempt fences are left exactly as
// they are, for the host's own highlighting.
//
// One example becomes one figure, wherever its fences sit. Docs
// introduce a multi-file example's files one by one in prose, so the
// figure stands at the example's entry file, with every file in its
// editor; the other fences stay in the flow as code — unless the whole
// group is one run of neighbouring fences, which the figure replaces
// whole rather than repeating under it.
//
// `<LiveCodeBlock>`-style components and a later Ljós-page prerender
// use the same pieces without remark: `assemble` and `renderStatic`
// from build.js, `hydrateLiveCodeBlocks` from `ljos-web/codeblock`.
//
// Options:
// - `harnesses`: `{ [name]: text }` (see `loadHarnesses` in build.js).
// - `qmlc`: the compiler to check with; without it nothing is checked.
// - `strict`: every non-exempt fence must compile and no tag may be
//   unknown, or the build fails. Without it, only fences that claim to
//   run (`harness=`/`file=`/`group=`/`before`) are held to it, and an
//   untagged block that does not compile yet — a snippet a docs tree
//   has not given a harness — stays plain code and is counted
//   (`onLegacy(count, file)`), never silently promised as live.
// - `pictures`: a `renderPictures` manifest; `pictureBase` where its
//   files are served from. A manifest entry marked failed (it compiled
//   for `qmlc` but did not run in a page) keeps its block plain, by the
//   same rule as a compile failure.
import { checkExamples, hashExample, renderStatic } from "./build.js";
import { assemble, parseMeta, tagged } from "./parse.js";

export function liveCodeBlocks(options = {}) {
  const { harnesses = {}, qmlc, strict = false, pictures = {}, pictureBase = "/codeblocks/", onLegacy } = options;
  // One compile per distinct example in a build, however many pages
  // repeat it: the answer is the code's, and its hash names it.
  const checked = new Map();
  const check = (example) => {
    const hash = hashExample(example);
    if (!checked.has(hash)) checked.set(hash, checkExamples([example], { qmlc }));
    return checked.get(hash);
  };

  return (tree, file) => {
    const fail = (message) => {
      throw new Error(`${file?.path ?? "a Markdown page"}: ${message}`);
    };
    // Every fence of the document, in order, with where it sits.
    const items = [];
    const collect = (node) => {
      if (!Array.isArray(node.children)) return;
      node.children.forEach((child) => {
        if (child.type === "code")
          items.push({
            parent: node,
            node: child,
            block: { ...parseMeta(child.lang, child.meta), code: child.value, line: child.position?.start?.line ?? 0 },
          });
        else collect(child);
      });
    };
    collect(tree);
    if (items.length === 0) return tree;

    const blocks = items.map((item) => item.block);
    const at = new Map(blocks.map((block, i) => [block, items[i]]));
    let outcome;
    try {
      outcome = assemble(blocks, { harnesses });
    } catch (error) {
      if (strict || blocks.some(tagged)) fail(error.message);
      onLegacy?.(items.length, file);
      return tree;
    }
    if (outcome.unknown.length > 0 && strict)
      fail(`line ${outcome.unknown[0].line}: a bare or unknown fence ("${outcome.unknown[0].lang}") is not an exempt tag`);

    let legacy = outcome.unknown.length;
    const actions = [];
    for (const example of outcome.examples) {
      const own = example.blocks.map((block) => at.get(block));
      const refuse = (diagnostics) => {
        if (strict || example.blocks.some(tagged)) fail(diagnostics);
        legacy += own.length;
      };
      const had = pictures[hashExample(example)];
      if (had?.failed) {
        refuse(`a code block does not run:\n${(had.diagnostics ?? []).join("\n")}`);
        continue;
      }
      // A drawn picture is a compile that ran: the picture step already
      // held this code to both, and its hash names the code.
      if (qmlc && !had?.file) {
        const failures = check(example);
        if (failures.length > 0) {
          refuse(`a code block does not compile:\n${failures[0].diagnostics.join("\n")}`);
          continue;
        }
      }
      const picture = had ? { src: `${pictureBase}${had.file}`, width: had.width, height: had.height } : undefined;
      const html = { type: "html", value: renderStatic(example, { picture }) };
      // One parent, neighbouring fences: the figure replaces the run.
      // Spread through prose: it replaces the entry's fence only.
      const parent = own[0].parent;
      const indexes = own.map((item) => parent.children.indexOf(item.node));
      const together =
        own.every((item) => item.parent === parent) && indexes.every((index, i) => index === indexes[0] + i);
      if (together) actions.push({ parent, nodes: own.map((item) => item.node), html });
      else {
        const entry = own.find((item) => (item.block.file ?? "Main.qml") === example.entry) ?? own[0];
        actions.push({ parent: entry.parent, nodes: [entry.node], html });
      }
    }
    // Last first, so an earlier splice cannot move a later one's place;
    // each place is looked up as it is used, not remembered.
    for (const { parent, nodes, html } of actions.reverse()) {
      const at = parent.children.indexOf(nodes[0]);
      parent.children.splice(at, nodes.length, html);
    }
    if (legacy > 0) onLegacy?.(legacy, file);
    return tree;
  };
}

export default liveCodeBlocks;
