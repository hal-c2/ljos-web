// The reader's page of codeblocks.spec.js: static figures as a build
// wrote them, hydrated where they stand.
import "../codeblocks/codeblock.css";
import "../style.css";
import { hydrateLiveCodeBlocks } from "../codeblocks/live.js";

window.codeblocks = hydrateLiveCodeBlocks(document);
window.ready = true;
