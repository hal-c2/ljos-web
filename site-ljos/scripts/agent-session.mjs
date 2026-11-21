// Makes the agent-built replay's session (bundle/Demos/logic/session.ts)
// from its recording (recordings/agent-built.json, which
// scripts/record-agent.mjs writes from a real session against `ljos`).
// The calls and answers are the recording's, word for word; what is
// added here is a sentence on what each step is for and what the page's
// running copy of the app does at it. tests/agent.spec.js keeps
// session.ts equal to what this makes.
//
//   node scripts/agent-session.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const recordingPath = join(here, "../recordings/agent-built.json");
export const sessionPath = join(here, "../bundle/Demos/logic/session.ts");

// An answer's text as the server gave it; one that is only JSON reads
// better laid out.
function answerText(answer) {
  if (answer.error) return JSON.stringify({ error: answer.error }, null, 2);
  try {
    return JSON.stringify(JSON.parse(answer.text), null, 2);
  } catch {
    return answer.text;
  }
}

// The answer cut to what a reader takes in at a glance: its first lines,
// and further lines the step is about, with what was left out said.
function cut(text, picks, keep = 10) {
  const lines = text.split("\n");
  if (lines.length <= keep + 2) return text;
  const wanted = new Set(lines.map((line, i) => (i < keep || picks.some((pick) => pick.test(line)) ? i : -1)).filter((i) => i >= 0));
  const out = [];
  let gap = 0;
  lines.forEach((line, i) => {
    if (wanted.has(i)) {
      if (gap) out.push(`… ${gap} ${gap === 1 ? "line" : "lines"} left out`);
      gap = 0;
      out.push(line);
    } else gap++;
  });
  if (gap) out.push(`… ${gap} ${gap === 1 ? "line" : "lines"} left out`);
  return out.join("\n");
}

// UTF-8 offsets, as `qml_edit_apply` gives them, in the file's characters.
function characters(text, changes) {
  const bytes = Buffer.from(text);
  const at = (offset) => bytes.subarray(0, offset).toString().length;
  return changes.map((change) => ({ start: at(change.start), end: at(change.end), replacement: change.replacement }));
}

export function makeSession(recording) {
  const steps = [];
  const edits = [];
  let text = recording.before;
  const state = { filter: false, fixed: false, openOnly: false };
  let reloads = 0;
  for (const step of recording.steps) {
    const { tool, args, answer } = step;
    const s = answer.structured ?? {};
    let says = "";
    let mark = "";
    let waits = false;
    let picks = [];
    if (tool === "qml_edit_apply") {
      const changes = characters(text, s.changes ?? []);
      for (const change of [...changes].sort((a, b) => b.start - a.start)) text = text.slice(0, change.start) + change.replacement + text.slice(change.end);
      edits.push(changes);
      says =
        args.edit.op === "insert_object"
          ? `Adds an “Open only” filter to the card’s header: a structural edit of ${args.path}, saved.`
          : `Binds the status ink to the theme’s warning colour, which is made legible on every surface, and saves ${args.path}.`;
    } else if (tool === "qml_check") {
      const n = (s.diagnostics ?? []).length;
      says = n === 0 ? `Checks ${args.paths.join(", ")}: no errors, no warnings.` : `Checks ${args.paths.join(", ")}: ${n} to fix.`;
    } else if (tool === "app_reload") {
      reloads++;
      if (reloads === 1) state.filter = true;
      else state.fixed = true;
      says = answer.text.startsWith("no file changed")
        ? "Asks the running app to take the saved file. It watches its files and took it as it was saved, so nothing is left to reload."
        : "Asks the running app to take the saved file. It does, and keeps its state.";
    } else if (tool === "app_find") {
      mark = "openFilter";
      says = "Finds the new filter in the running app by its role and name, as a person would.";
    } else if (tool === "app_audit") {
      const findings = s.findings ?? [];
      if (findings.length) {
        mark = "stateText";
        says = `Audits the ticket list in light and dark, high contrast, larger text and a small window. In light, ${findings[0].message.replace(/^the /, "the ")}.`;
        picks = [/^\d+ error/, /^\s+\S+ < /];
      } else says = "Audits the ticket list again under every setting: nothing found.";
      picks.push(/error\(s\)/);
    } else if (tool === "app_inspect") {
      mark = "stateText";
      says = `Inspects a flagged label: its colour is a binding that reads the card’s statusInk, ${String((answer.text.match(/color: color = (#[0-9a-f]{6})/) ?? [])[1] ?? "")} here.`;
      picks = [/^dependencies/, /^\s+(reads|read by):/, /^\s+(text|color): /];
    } else if (tool === "app_click") {
      state.openOnly = true;
      mark = "openFilter";
      const heading = (answer.text.match(/heading "([^"]+)"/) ?? [])[1] ?? "";
      says = `Presses the filter in the running app${heading ? `: the heading says “${heading}”, and the closed tickets leave the list` : ""}.`;
    } else if (tool === "app_snapshot") {
      mark = "card";
      says = "Reads the card’s accessibility outline: what a screen reader hears, and the references an agent acts on.";
      picks = [];
    } else if (tool === "app_watch") {
      if (!args.since) says = "Asks for the app’s counts, to wait from them.";
      else {
        waits = true;
        says = "Waits for the app to log something. On this page it waits for you: assign a crew to a ticket in the card.";
      }
    } else if (tool === "app_logs") {
      says = "Reads what the app logged: the crew the person at the app picked.";
    } else throw new Error(`agent-session: no sentence for ${tool}`);
    const full = answerText(answer);
    steps.push({
      via: step.via,
      tool,
      args: JSON.stringify(args, null, 2),
      answer: full,
      short: cut(full, picks),
      failed: Boolean(answer.error || answer.isError),
      says,
      mark,
      waits,
      edit: edits.length,
      filter: state.filter,
      fixed: state.fixed,
      openOnly: state.openOnly,
    });
  }
  // What the person at the app picked while the agent waited, as the
  // app logged it: the page makes the same pick for a reader who makes
  // none.
  const said = recording.steps.at(-1).answer.text.match(/(\S+) assigned to (.+)$/m);
  if (!said) throw new Error("agent-session: the last answer has no crew assigned");
  const pick = { ticket: said[1], crew: said[2], line: said[0].trim() };
  if (text !== recording.final) throw new Error("agent-session: the recorded edits do not make the recorded file");
  const out = [
    "// Written by scripts/agent-session.mjs from recordings/agent-built.json,",
    "// a real session against Ljós's MCP servers: change the recording, not",
    "// this file. Each step is a call as it was sent and the answer as it",
    "// came, with a sentence on what it is for and what the page's running",
    "// app shows after it.",
    "",
    'import type { Change } from "./agent.ts"',
    "",
    'export type Via = "authoring" | "inspector"',
    "",
    "export interface Step {",
    "    readonly via: Via",
    "    readonly tool: string",
    "    readonly args: string",
    "    readonly answer: string",
    "    readonly short: string",
    "    readonly failed: boolean",
    "    readonly says: string",
    "    // The app's item to ring: an objectName, or none.",
    "    readonly mark: string",
    "    // Whether the agent waits here on the person at the app.",
    "    readonly waits: boolean",
    "    // How many of the edits stand after it.",
    "    readonly edit: number",
    "    // The running app after it: the filter there, the ink fixed, the filter on.",
    "    readonly filter: boolean",
    "    readonly fixed: boolean",
    "    readonly openOnly: boolean",
    "}",
    "",
    `export const recordedOn: string = ${JSON.stringify(recording.recorded.on)}`,
    `export const ljos: string = ${JSON.stringify(recording.recorded.ljos)}`,
    `export const commands: readonly string[] = ${JSON.stringify(recording.recorded.commands)}`,
    'export const file: string = "DispatchCard.qml"',
    `export const before: string = ${JSON.stringify(recording.before)}`,
    `export const edits: readonly (readonly Change[])[] = ${JSON.stringify(edits)}`,
    "// The crew the person picked while the agent waited, and the line it logged.",
    `export const pick: { readonly ticket: string; readonly crew: string; readonly line: string } = ${JSON.stringify(pick)}`,
    `export const steps: readonly Step[] = ${JSON.stringify(steps, null, 4)}`,
    "",
  ];
  return out.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) writeFileSync(sessionPath, makeSession(JSON.parse(readFileSync(recordingPath, "utf8"))));
