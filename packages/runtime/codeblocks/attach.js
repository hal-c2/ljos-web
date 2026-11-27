// The code editor over a QML item (`ljos-web/codeblock/attach`): for a
// Ljós page that draws its own code blocks, as a site built from QML
// does. The page shows its code highlighted by the build in a rich Text
// (`lezer-ljos/html`'s `tok-*` spans), inside an item that holds the
// code as its `text`; on the reader's first focus, press or key, or
// when the page is idle, this puts CodeMirror (`./editor.js`) in that
// item's place, in the Text's own font and line height, so no line
// moves. Like the editor itself, it is only ever imported lazily.
//
// The item stays the field as QML sees it: an edit is written to its
// `text`, a press in the editor gives it active focus, and when QML
// moves focus away (Tab, Shift+Tab, a click elsewhere) the editor is
// left. The editor's keys are its own: what it takes is kept from the
// page's key handling, and what it leaves (Tab after Escape, Shift+Tab,
// Escape) goes on to it, so QML's tab chain moves on from the item.
import { settle } from "../object.ts";
import { createCodeEditor } from "./editor.js";

// The look the editor takes from the Text it replaces.
const LOOK = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "color"];

// The element of a QML Text that draws its words.
const wordsOf = (text) => text?.$node?.querySelector(".qq-markup, .qq-text") ?? text?.$node ?? null;

// Keys the editor did not take that are the page's to hear: leaving
// it, and Escape for whatever around it closes on one.
const leaves = (event) => event.key === "Tab" || event.key === "Escape";

/**
 * CodeMirror in `item`'s place (a QML Item with a `text` property):
 * `lang` is its grammar, `label` its name to a screen reader, `like`
 * the QML Text whose look it takes and which it hides, `errors` the QML
 * item (or an element's id) that sums its diagnostics up, `point` where
 * a press that brought it in was, for the caret. Answers what a page
 * does with it: `setText`, `setDiagnostics`, `focus`, `blur`, `destroy`.
 */
export function attachCodeEditor(item, { lang = "qml", label = "Code", description, like, errors, point } = {}) {
  const node = item.$node;
  const host = document.createElement("div");
  host.className = "ljos-codeblock__editor ljos-codeblock__editor--item";
  // The item's box, the item's size: QML lays the item out, the editor
  // fills it, and says how tall its lines are (`implicitHeight`).
  Object.assign(host.style, { position: "absolute", left: "0", top: "0", width: "100%", margin: "0", padding: "0" });
  const words = wordsOf(like);
  const restyle = () => {
    if (!words) return;
    const look = getComputedStyle(words);
    for (const property of LOOK) host.style[property] = look[property];
    // A phone zooms in on a field whose words are under 16px as it is
    // focused: on a coarse pointer the editor is never smaller, its lines
    // as far apart for their size (the press that brought it in moves
    // the page, not the page by itself).
    const size = parseFloat(host.style.fontSize);
    if (size < 16 && globalThis.matchMedia?.("(pointer: coarse)").matches) {
      const pitch = parseFloat(host.style.lineHeight);
      host.style.fontSize = "16px";
      host.style.lineHeight = pitch > 0 ? `${Math.round((16 * pitch) / size)}px` : "";
    }
  };
  restyle();
  // The Text, hidden, still draws what its bindings say: a page's scheme
  // picked while the editor is in (its ink, its size) reaches the Text's
  // style, and from there the editor, which took its look once only and
  // kept the old ink on the new ground.
  const restyled = typeof MutationObserver === "function" && like?.$node ? new MutationObserver(restyle) : null;
  restyled?.observe(like.$node, { attributes: true, attributeFilter: ["style", "class"], subtree: true });
  host.style.setProperty("--ljos-code-pad", "0");
  host.style.background = "transparent";
  host.style.maxHeight = "none";

  let errorsId;
  if (typeof errors === "string") errorsId = errors;
  else if (errors?.$node) {
    errors.$node.id ||= `ljos-codeblock-errors-${++attached}`;
    errorsId = errors.$node.id;
  }

  // A file's last newline is not a line to show (the Text shows none),
  // so the editor holds the text without it and gives it back with it.
  let tail = "";
  const inward = (text) => {
    text = String(text ?? "");
    tail = text.endsWith("\n") ? "\n" : "";
    return tail ? text.slice(0, -1) : text;
  };
  const editor = createCodeEditor(host, {
    doc: inward(item.text),
    lang,
    label,
    ...(description ? { description } : {}),
    errors: errorsId,
    onChange(text) {
      item.text = text + tail;
      settle();
    },
  });
  const { view } = editor;
  // The scroller's height is the lines' own: QML sizes the item to it.
  view.scrollDOM.style.maxHeight = "none";
  view.scrollDOM.style.overflowY = "hidden";

  // What the editor takes is its own; what it leaves goes on to QML.
  const keep = (event) => {
    if (event.defaultPrevented || !leaves(event)) event.stopPropagation();
  };
  host.addEventListener("keydown", keep);
  host.addEventListener("keyup", keep);
  // A mouse press in the editor is the editor's (a drag selects), not a
  // press on what is under it; a touch still reaches a Flickable around
  // it, so a finger scrolls the page.
  host.addEventListener("mousedown", (event) => event.stopPropagation());
  host.addEventListener("pointerdown", (event) => event.pointerType === "mouse" && event.stopPropagation());
  view.contentDOM.addEventListener("focus", () => {
    if (!item.activeFocus) {
      item.forceActiveFocus();
      settle();
    }
  });

  if (like) like.visible = false;
  node.append(host);

  const sized = (height) => {
    if (Math.abs((item.implicitHeight ?? 0) - height) > 0.25) {
      item.implicitHeight = height;
      settle();
    }
  };
  // The first height waits for CodeMirror to have measured its lines.
  // Until then it guesses the lines it hasn't drawn at a default height
  // of its own, and an item sized to the guess drew long code shorter
  // for a frame and then grew it back. So the editor's height is read
  // in CodeMirror's measuring, and taken once two readings agree; the
  // item keeps the Text's height, the same lines', until then. After
  // that a change (a line typed) is taken in the frame it is made.
  let first = true;
  let read;
  const measuring = {
    key: "ljos-codeblock-height",
    read: () => view.dom.getBoundingClientRect().height,
    write: (height) => {
      if (height !== read) {
        read = height;
        view.requestMeasure(measuring);
        return;
      }
      first = false;
      sized(height);
    },
  };
  const watch =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => (first ? view.requestMeasure(measuring) : sized(view.dom.getBoundingClientRect().height)))
      : null;
  watch?.observe(view.dom);
  view.requestMeasure(measuring);

  if (point) {
    const at = view.posAtCoords(point);
    if (at !== null) view.dispatch({ selection: { anchor: at } });
  }

  return {
    view,
    get text() {
      return editor.text + tail;
    },
    setText(text) {
      editor.setText(inward(text));
    },
    setDiagnostics: (diagnostics) => editor.setDiagnostics(diagnostics),
    focus() {
      if (view.hasFocus) return;
      view.focus();
      // Shown and focused by one change (`visible = true` and then
      // `forceActiveFocus()`, as in Qt): the page shows the editor once
      // that change reaches it, which from a handler a press told of is
      // a frame or so on, and a browser gives no focus to what it cannot
      // see yet. A few frames on, while the item still has the focus,
      // it is asked again; then the reader has moved on, or it never
      // will be shown.
      let frames = 4;
      const again = () => {
        if (!item.activeFocus || view.hasFocus || frames-- === 0) return;
        view.focus();
        if (!view.hasFocus) requestAnimationFrame(again);
      };
      if (!view.hasFocus) requestAnimationFrame(again);
    },
    blur() {
      if (view.hasFocus) view.contentDOM.blur();
    },
    destroy() {
      watch?.disconnect();
      restyled?.disconnect();
      editor.destroy();
      host.remove();
      if (like) like.visible = true;
    },
  };
}

let attached = 0;
