// The agent-built demo replays a real session against Ljós's MCP
// servers (recordings/agent-built.json, from scripts/record-agent.mjs).
// What the page shows is made from it, so these keep the page's steps
// the recording's: the same tools, the same arguments, the same file.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { makeSession, recordingPath, sessionPath } from "../scripts/agent-session.mjs";
import { changedLines, clamp, excerpt, sourceAt } from "../bundle/Demos/logic/agent.ts";
import { before, edits, steps } from "../bundle/Demos/logic/session.ts";

const recording = JSON.parse(readFileSync(recordingPath, "utf8"));
const shipped = readFileSync(new URL("../bundle/Demos/Dispatch/DispatchCard.qml", import.meta.url), "utf8");

test("the committed session is the one the recording makes", () => {
  expect(readFileSync(sessionPath, "utf8")).toBe(makeSession(recording));
});

test("the recorded edits, made to the file the session began with, make the card the site ships", () => {
  expect(recording.final).toBe(shipped);
  expect(sourceAt(before, edits, edits.length)).toBe(shipped);
  expect(sourceAt(before, edits, 0)).toBe(before);
});

test("every call is to a tool its server listed, with only arguments that tool takes", () => {
  expect(steps.length).toBe(recording.steps.length);
  for (const [i, step] of steps.entries()) {
    const listed = recording.tools[step.via].find((tool) => tool.name === step.tool);
    expect(listed, `step ${i + 1}: ${step.tool} on ${step.via}`).toBeTruthy();
    for (const key of Object.keys(JSON.parse(step.args))) expect(listed.args, `step ${i + 1}: ${step.tool} takes ${key}`).toContain(key);
  }
});

test("the audit the copy promises is step 5, and it finds the contrast the edit at step 7 fixes", () => {
  expect(steps[4].tool).toBe("app_audit");
  expect(steps[4].answer).toContain("color-text-contrast");
  expect(steps[6].tool).toBe("qml_edit_apply");
  expect(steps[9].tool).toBe("app_audit");
  expect(steps[9].answer).toMatch(/^Nothing found/m);
  expect(steps.findIndex((step) => step.fixed)).toBe(8);
});

test("no answer names the machine it was recorded on", () => {
  const text = readFileSync(recordingPath, "utf8");
  expect(text).not.toMatch(/\/(home|run|tmp)\//);
});

test("an edit's lines are where it wrote them, and an excerpt keeps to the file", () => {
  const [first, last] = changedLines(before, edits, 1);
  const lines = sourceAt(before, edits, 1).split("\n");
  expect(lines.slice(first - 1, last).join("\n")).toContain('objectName: "openFilter"');
  expect(lines[first - 1].trim()).toBe("Button {");
  expect(lines[last - 1].trim()).toBe("}");
  const [fixed] = changedLines(before, edits, 2);
  expect(sourceAt(before, edits, 2).split("\n")[fixed - 1]).toContain("Theme.warningForeground");
  expect(changedLines(before, edits, 0)).toEqual([0, -1]);
  const cut = excerpt("a\nb\nc\nd\ne", 2, 2, 1);
  expect(cut).toEqual({ first: 1, lines: ["a", "b", "c"] });
  expect(excerpt("a\nb", 0, -1, 3).lines).toEqual(["a", "b"]);
  expect(clamp(99, 15)).toBe(15);
  expect(clamp(-2, 15)).toBe(0);
});
