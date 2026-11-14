// The reader's page of examplefiles.spec.js: each example of
// examplefiles-fixtures.js as a live code block, mounted when a test
// names it, in a page whose address is not the examples'.
import "../codeblocks/codeblock.css";
import "../style.css";
import { mountLiveCodeBlock } from "../codeblocks/live.js";
import { EXAMPLES } from "./examplefiles-fixtures.js";

// The blocks mounted, by example, for a test to dispose.
const blocks = {};
// The projects the page has enclosed, by root, and the addresses each
// one's files are loaded from.
window.enclosed = () =>
  Object.fromEntries([...(globalThis[Symbol.for("ljos-web/enclosed")]?.values() ?? [])].map((project) => [project.root, [...project.blobs.values()]]));

// The text files of examples the page was given to read, by address.
window.provided = () => [...(globalThis[Symbol.for("ljos-web/files")]?.given.keys() ?? [])].filter((url) => url.startsWith("ljos-example:"));

// `waits` false: mounted and not waited for, its first compile still on
// its way.
window.mountExample = async (name, waits = true) => {
  const figure = document.createElement("figure");
  figure.className = "ljos-codeblock";
  figure.dataset.ljosCodeblock = "";
  figure.dataset.example = name;
  document.body.append(figure);
  const block = await mountLiveCodeBlock(figure, EXAMPLES[name], { delay: 0 });
  blocks[name] = block;
  if (waits) await block.idle();
};

window.disposeExample = async (name) => {
  const block = blocks[name];
  block.dispose();
  await block.idle();
};
// Disposed now, its compile let alone; `idleExample` waits for it.
window.disposeNow = (name) => blocks[name].dispose();
window.idleExample = (name) => blocks[name].idle();
window.ready = true;
