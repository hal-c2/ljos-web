// Column {
//     // Chosen by the address, the same in a prerender and a browser.
//     Loader { source: Later.byAddress }   // Later.byAddress.awaited = true
//     // Chosen by what only the reader's browser knows.
//     Loader { source: Later.inBrowser }
// }
import { Column, Loader, Text } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const ByAddress = () => make(Text, { text: "Loaded with the page" });
const InBrowser = () => make(Text, { text: "Loaded in the browser's own time" });

// The browser's part comes once a test lets it, so whether it is in the
// page as written never turns on which import came first.
let open;
const opened = new Promise((resolve) => (open = resolve));
export const inBrowserGate = { open: () => open() };

function byAddress() {
  return Promise.resolve({ default: ByAddress });
}
byAddress.awaited = true;
function inBrowser() {
  return opened.then(() => ({ default: InBrowser }));
}

export default function AwaitedLoad() {
  return make(Column, {}, () => [make(Loader, { source: byAddress }), make(Loader, { source: inBrowser })]);
}
