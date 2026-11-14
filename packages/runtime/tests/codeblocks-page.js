// The reader's page of codeblocks.spec.js: static figures as a build
// wrote them, hydrated where they stand. `?editor=on-demand` keeps the
// editor out until a reader reaches for the code (no idle load), so a
// test can watch it come in.
import "../codeblocks/codeblock.css";
import "../style.css";
import { hydrateLiveCodeBlocks } from "../codeblocks/live.js";

const editor = new URLSearchParams(location.search).get("editor") ?? undefined;
window.codeblocks = hydrateLiveCodeBlocks(document, { editor });
window.ready = true;
