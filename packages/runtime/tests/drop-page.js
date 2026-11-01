// A site built with `liveShell`, for drop.spec.js: its own shell is
// scenes/drop/Shell.qml, over the block module scenes/drop/Shop. A test
// says what the site's publish hook answers (`window.publishing`) and reads
// what it was given (`window.published`).
import { liveShell } from "ljos-web/live";
import { flush } from "ljos-web/object";
import { $reloaded } from "ljos-web/reload";
import Shell from "./scenes/drop/Shell.qml";
import Reaches from "./scenes/drop/Reaches.qml";
import UsesLess from "./scenes/drop/UsesLess.qml";
import Keeping from "./scenes/drop/Keeping.qml";
import { saved as databasesSaved } from "ljos-web/QtQuick/LocalStorage";

window.publishing = { answer: { url: "https://shells.example/1" } };
window.liveShell = liveShell;
window.Shell = Shell;
window.Reaches = Reaches;
window.Keeping = Keeping;
window.databasesSaved = databasesSaved;
// As a dev server does on a save: the new root is made before the old one goes.
window.saved = (less) => $reloaded(Shell, less ? UsesLess : Shell);
const live = liveShell(Shell, document.getElementById("scene"), {
  allowedHosts: window.allowedHosts,
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
