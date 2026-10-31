// A site built with `liveShell`, for drop.spec.js: its own shell is
// scenes/drop/Shell.qml, over the block module scenes/drop/Shop. A test
// says what the site's publish hook answers (`window.publishing`) and reads
// what it was given (`window.published`).
import { liveShell } from "ljos-web/live";
import { flush } from "ljos-web/object";
import Shell from "./scenes/drop/Shell.qml";

window.publishing = { answer: { url: "https://shells.example/1" } };
const live = liveShell(Shell, document.getElementById("scene"), {
  publish: async (text, meta) => {
    window.published = { text, meta };
    if (window.publishing.error) throw new Error(window.publishing.error);
    return window.publishing.answer;
  },
});
Object.defineProperty(window, "scene", { get: () => live.object });
window.live = live;
window.flush = flush;
await live.idle();
window.ready = true;
