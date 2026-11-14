// The reader's page of examplefiles.spec.js: each example of
// examplefiles-fixtures.js as a live code block, mounted when a test
// names it, in a page whose address is not the examples'.
import "../codeblocks/codeblock.css";
import "../style.css";
import { mountLiveCodeBlock } from "../codeblocks/live.js";
import { EXAMPLES } from "./examplefiles-fixtures.js";

window.mountExample = async (name) => {
  const figure = document.createElement("figure");
  figure.className = "ljos-codeblock";
  figure.dataset.ljosCodeblock = "";
  figure.dataset.example = name;
  document.body.append(figure);
  const block = await mountLiveCodeBlock(figure, EXAMPLES[name], { delay: 0 });
  await block.idle();
};
window.ready = true;
