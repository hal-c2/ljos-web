// The conditions a server bundle of pages resolves its packages under:
// those of the page in a browser. Under Node's own, Solid is its server
// build, where a write tells no one and nothing settles, so a page would
// be written as its bindings first read: before a Repeater's rows reached
// the Column they are in, before `Component.onCompleted` changed anything,
// and unlike the page it then hydrates into. A render runs over a DOM of
// its own (`./dom.js`), as the page would in a browser.
export const CLIENT_CONDITIONS = ["browser", "module", "production"];
