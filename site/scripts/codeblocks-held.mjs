// The examples codeblock-prerenders.mjs let stand plain because the
// ledger lists them (codeblocks-ledger.mjs), carried to the Markdown
// step. That step holds every claimed example to running and stops the
// page on the first that does not; it cannot read the ledger, since it
// sees one page at a time and the ledger excuses an example only when
// every page that shows it lists it. So the prerender step writes the
// hashes it excused, and the page build takes those fences out of the
// live-block plugin's sight: they stay the page's own code, highlighted
// as any other, and are counted with the plain blocks.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashExample } from "ljos-web/codeblocks";
import { assemble, parseMeta } from "ljos-web/codeblocks/parse";

const FILE = "held-plain.json";

export function writeHeld(cacheDir, hashes) {
  writeFileSync(join(cacheDir, FILE), `${JSON.stringify([...hashes].sort(), null, 2)}\n`);
}

export function readHeld(cacheDir) {
  const at = join(cacheDir, FILE);
  return new Set(existsSync(at) ? JSON.parse(readFileSync(at, "utf8")) : []);
}

// `plugin` as a remark attacher whose transformer never sees the fences
// of an example in `held`. They are swapped for an empty node while it
// runs and put back after, so their places do not move and the plugin
// assembles the rest exactly as it would have.
export function holdPlain(plugin, held) {
  return (options = {}) => {
    const transform = plugin(options);
    return (tree, file) => {
      if (held.size === 0) return transform(tree, file);
      const fences = [];
      const collect = (node) => {
        for (const child of node.children ?? [])
          if (child.type === "code") fences.push({ parent: node, node: child, block: { ...parseMeta(child.lang, child.meta), code: child.value } });
          else collect(child);
      };
      collect(tree);
      let examples;
      try {
        ({ examples } = assemble(
          fences.map((fence) => fence.block),
          { harnesses: options.harnesses ?? {} },
        ));
      } catch {
        // A page that does not assemble is the plugin's to refuse.
        return transform(tree, file);
      }
      const of = new Map(fences.map((fence) => [fence.block, fence]));
      const away = examples
        .filter((example) => held.has(hashExample(example)))
        .flatMap((example) => example.blocks.map((block) => of.get(block)))
        .map((fence) => {
          const stand = { type: "ljosHeldPlain" };
          fence.parent.children.splice(fence.parent.children.indexOf(fence.node), 1, stand);
          return { ...fence, stand };
        });
      try {
        transform(tree, file);
      } finally {
        for (const { parent, node, stand } of away) parent.children.splice(parent.children.indexOf(stand), 1, node);
      }
      if (away.length > 0) options.onLegacy?.(away.length, file);
      return tree;
    };
  };
}
