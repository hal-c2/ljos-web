// The little CSS an item needs: QML positions everything itself, so an item
// is taken out of the flow and measured from its parent's top left corner.
const sheet = new CSSStyleSheet();
sheet.replaceSync(`
.q-scene { position: relative; overflow: hidden; }
.qq { position: absolute; left: 0; top: 0; box-sizing: border-box; transform-origin: 0 0; }
a.qq { color: inherit; text-decoration: none; }
.qq-under { background: none !important; box-shadow: none !important; }
.qq-under::before { content: ""; position: absolute; inset: 0; z-index: 0; border-radius: inherit; background: var(--qq-fill); box-shadow: var(--qq-edge); }
`);
document.adoptedStyleSheets.push(sheet);
