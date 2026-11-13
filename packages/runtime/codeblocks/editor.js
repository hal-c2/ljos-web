// The code editor of a live block (`ljos-web/codeblock/editor`):
// CodeMirror 6 over the Lezer grammar of QML and the Ljós dialect
// (`lezer-ljos`), coloured by the same `tok-*` classes the build writes
// into static HTML, so the editor taking a block over changes no
// colour and, with codeblock.css's metrics, moves no line.
//
// This module is the heavy half and is only ever imported lazily
// (live.js, `attach.js`): a page that nobody edits never loads it.
//
// The keyboard is #14's: Tab indents, but never traps. Shift+Tab always
// leaves, and Escape makes the next Tab leave too, until the editor is
// entered again. Its hint says so to a screen reader.
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from "@codemirror/commands";
import { bracketMatching, foldNodeProp, indentNodeProp, indentUnit, LRLanguage, LanguageSupport, syntaxHighlighting, delimitedIndent, continuedIndent } from "@codemirror/language";
import { lintKeymap, setDiagnostics } from "@codemirror/lint";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, highlightSpecialChars, keymap } from "@codemirror/view";
import { langOf, parserFor } from "lezer-ljos";
import { classHighlighter } from "lezer-ljos/html";

export const HINT = "Tab indents. Press Escape, then Tab, to leave this editor.";

const languages = new Map();

// The grammar of a fence tag or file name, as a CodeMirror language. A
// tag the grammar does not read is edited as plain text.
export function languageFor(tagOrFile) {
  const lang = langOf(tagOrFile);
  if (!lang) return [];
  if (!languages.has(lang)) {
    const parser = parserFor(tagOrFile).configure({
      props: [
        indentNodeProp.add({
          "Block ClassBody SwitchBody EnumBody ObjectType MatchBody UiObjectInitializer": delimitedIndent({ closing: "}" }),
          "ObjectExpression ObjectPattern ObjectMatchPattern": delimitedIndent({ closing: "}" }),
          "ArrayExpression ArrayPattern ArrayMatchPattern UiArrayBinding TupleType": delimitedIndent({ closing: "]" }),
          "ArgList ParamList ParenthesizedExpression UiSignalParams": delimitedIndent({ closing: ")" }),
          "Statement Property UiBinding": continuedIndent({ except: /^\s*\{/ }),
        }),
        foldNodeProp.add({ "Block ClassBody ObjectExpression ArrayExpression UiObjectInitializer MatchBody": (node) => ({ from: node.from + 1, to: node.to - 1 }) }),
      ],
    });
    const language = LRLanguage.define({
      name: lang,
      parser,
      languageData: {
        commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
        indentOnInput: /^\s*[}\])]$/,
        closeBrackets: { brackets: ["(", "[", "{", "'", '"', "`"] },
      },
    });
    languages.set(lang, new LanguageSupport(language));
  }
  return languages.get(lang);
}

// Tab: four spaces at a caret, a level more on a selection. Never
// Shift+Tab: that is the reader's way out, always.
function tabber(escaped) {
  return keymap.of([
    {
      key: "Tab",
      run(view) {
        if (escaped.on) return false;
        const { state } = view;
        if (state.selection.ranges.every((r) => r.empty)) {
          view.dispatch(state.update(state.replaceSelection(state.facet(indentUnit)), { scrollIntoView: true, userEvent: "input.indent" }));
          return true;
        }
        return indentMore(view);
      },
    },
    {
      key: "Escape",
      run() {
        escaped.on = true;
        // Escape is the editor's, but other handlers on the page (a
        // dialog's close) still hear it: the editor only remembers it.
        return false;
      },
    },
    // Mod-[ for the reader who wants a level less without leaving.
    { key: "Mod-[", run: indentLess },
  ]);
}

// The editor draws its text in the box the static `<pre>` had: the
// font, line height and padding are the surrounding element's
// (codeblock.css sets them on both), so taking a block over moves no
// line. Squiggles are a text decoration in the theme's own diagnostic
// colours, not CodeMirror's drawn image, so a site's theme reaches them.
const metrics = EditorView.theme({
  "&": { fontSize: "inherit", color: "var(--ljos-code-fg, inherit)" },
  "&.cm-focused": { outline: "2px solid var(--ljos-codeblock-focus, currentColor)", outlineOffset: "-2px" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "inherit", overflow: "auto" },
  ".cm-content": { padding: "var(--ljos-code-pad, 0.75em 0.9em)", caretColor: "var(--ljos-code-fg, currentColor)" },
  ".cm-line": { padding: "0" },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--ljos-code-diagnostic-error, #c62828)",
    textDecorationSkipInk: "none",
    textUnderlineOffset: "0.2em",
  },
  ".cm-lintRange-warning, .cm-lintRange-info, .cm-lintRange-hint": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--ljos-code-diagnostic-warning, #a66300)",
    textDecorationSkipInk: "none",
    textUnderlineOffset: "0.2em",
  },
  ".cm-tooltip": {
    background: "var(--ljos-code-bg, Canvas)",
    color: "var(--ljos-code-fg, CanvasText)",
    border: "1px solid var(--ljos-code-gutter, color-mix(in srgb, currentColor 30%, transparent))",
    font: "0.9em/1.4 system-ui, sans-serif",
  },
  ".cm-diagnostic-error": { borderLeftColor: "var(--ljos-code-diagnostic-error, #c62828)" },
  ".cm-diagnostic-warning": { borderLeftColor: "var(--ljos-code-diagnostic-warning, #a66300)" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": { background: "var(--ljos-code-selection, color-mix(in srgb, currentColor 18%, transparent))" },
});

// One position of a 1-based `{ line, column }` in `doc`, clamped into it.
function offset(doc, line, column) {
  const at = doc.line(Math.min(Math.max(1, line | 0 || 1), doc.lines));
  return Math.min(at.to, at.from + Math.max(0, (column | 0 || 1) - 1));
}

/**
 * The compiler's diagnostics for this editor's file, as CodeMirror's:
 * each `{ message, line, column, endLine?, endColumn?, severity? }` is
 * 1-based; one without an end marks the word it points at (or the
 * character before a line's end), and one without a line is the
 * file's, at its first word.
 */
export function toDiagnostics(doc, diagnostics) {
  return diagnostics.map((d) => {
    let from = d.line ? offset(doc, d.line, d.column) : 0;
    let to = d.endLine ? offset(doc, d.endLine, d.endColumn) : from;
    if (to <= from) {
      // No range: the word (or sign) it points at, past any spaces;
      // with nothing after it on the line (an unclosed block is told
      // at the end of the file), the last sign before it, so the mark
      // is a squiggle that is seen, not an empty point.
      const line = doc.lineAt(from);
      const word = /^(\s*)([\w$.]+|\S)/.exec(line.text.slice(from - line.from));
      if (word) {
        from += word[1].length;
        to = from + word[2].length;
      } else {
        const before = /\S\s*$/.exec(doc.sliceString(0, from));
        if (before) {
          from = before.index;
          to = from + 1;
        } else to = Math.min(doc.length, from + 1);
      }
    }
    return {
      from,
      to,
      severity: d.severity === "warning" ? "warning" : d.severity === "info" ? "info" : "error",
      message: d.code ? `${d.message} [${d.code}]` : d.message,
      source: d.code,
    };
  });
}

/**
 * An editor in `parent` holding `doc`. `onChange(text)` hears every
 * edit; `label` names it to a screen reader, `description` is its hint
 * (the keyboard's, by default), and `errors` is the id of the element
 * that sums its diagnostics up. Answers the view and what a
 * block does with it: `text`, `setText`, `setDiagnostics`, `focus`,
 * `destroy`.
 */
export function createCodeEditor(parent, { doc = "", lang = "qml", label = "Code", description = HINT, errors, onChange, extensions = [] } = {}) {
  const escaped = { on: false };
  let quiet = false;
  // What a screen reader is told about the field, and whether it holds
  // an error now: `aria-invalid`, pointing at the block's summary.
  const attributes = new Compartment();
  const attrs = (invalid) =>
    EditorView.contentAttributes.of({
      "aria-label": label,
      "aria-description": description,
      spellcheck: "false",
      autocorrect: "off",
      autocapitalize: "off",
      translate: "no",
      ...(invalid ? { "aria-invalid": "true", ...(errors ? { "aria-errormessage": errors } : {}) } : {}),
    });
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        highlightSpecialChars(),
        history(),
        bracketMatching(),
        indentUnit.of("    "),
        EditorState.tabSize.of(4),
        languageFor(lang),
        syntaxHighlighting(classHighlighter),
        tabber(escaped),
        keymap.of([...defaultKeymap, ...historyKeymap, ...lintKeymap]),
        metrics,
        attributes.of(attrs(false)),
        // Entering the editor again turns Tab back into indenting:
        // ours, and CodeMirror's own Escape-then-Tab, which would last
        // two seconds whatever the reader did. On the focus itself, not
        // the update CodeMirror reports it in a moment later: a reader
        // quick to leave again would be gone before that, and the
        // Escape would still be armed on the next visit.
        EditorView.domEventHandlers({
          focus(_event, view) {
            escaped.on = false;
            view.setTabFocusMode(false);
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !quiet) onChange?.(update.state.doc.toString());
        }),
        ...extensions,
      ],
    }),
  });
  return {
    view,
    get text() {
      return view.state.doc.toString();
    },
    // The block's own writing (Reset): no edit is heard for it. It is
    // a text as written, so it is read from its start: the caret goes
    // there and the start is scrolled to, where a caret left at the
    // end of the reader's text would keep the editor on its last lines.
    setText(text) {
      if (text === view.state.doc.toString()) return;
      quiet = true;
      try {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          selection: { anchor: 0 },
          effects: EditorView.scrollIntoView(0, { y: "nearest" }),
        });
      } finally {
        quiet = false;
      }
    },
    // The compiler's words for this file (see `toDiagnostics`); none
    // clears them.
    setDiagnostics(diagnostics) {
      const marks = toDiagnostics(view.state.doc, diagnostics);
      view.dispatch(setDiagnostics(view.state, marks));
      view.dispatch({ effects: attributes.reconfigure(attrs(marks.some((d) => d.severity === "error"))) });
    },
    focus() {
      view.focus();
    },
    destroy() {
      view.destroy();
    },
  };
}
