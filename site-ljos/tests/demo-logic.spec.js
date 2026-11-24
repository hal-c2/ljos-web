// The demos' remix knobs are one-line edits a reader makes: whatever
// number they type, the demo keeps to what it can draw.
import { expect, test } from "@playwright/test";
import { nextPalette, paletteIndex } from "../bundle/Demos/logic/shader.ts";

test("a Shader start palette out of range opens on one of the scheme's own ramps", () => {
  const count = 3;
  // light.frag keeps the dark ramps at 0..2 and the light ones at 3..5.
  for (const choice of [-4, -1, 0, 2, 3, 5, 6, 7, 100]) {
    const dark = paletteIndex(choice, true, count);
    const light = paletteIndex(choice, false, count);
    expect(dark, `startPalette ${choice} in dark`).toBeGreaterThanOrEqual(0);
    expect(dark, `startPalette ${choice} in dark`).toBeLessThan(count);
    expect(light, `startPalette ${choice} in light`).toBeGreaterThanOrEqual(count);
    expect(light, `startPalette ${choice} in light`).toBeLessThan(2 * count);
    expect(light - dark, `startPalette ${choice}: the same ramp in both schemes`).toBe(count);
  }
});

test("a tap from any start palette moves to the next of the scheme's ramps", () => {
  const count = 3;
  expect(nextPalette(0, count)).toBe(1);
  expect(nextPalette(2, count)).toBe(0);
  expect(nextPalette(-1, count)).toBe(0);
  expect(nextPalette(-5, count)).toBe(2);
  expect(nextPalette(7, count)).toBe(2);
});

// The TypeScript the front page shows, which lays out the app beside it:
// the list's board.ts, and the board's, its edit.
test("the board puts each ticket in one lane, by whether it has a crew, and the list keeps the one order", async () => {
  const list = (await import("../bundle/Demos/logic/before/board.ts")).lanes;
  const board = (await import("../bundle/Demos/logic/after/board.ts")).lanes;
  const tickets = [{ key: "A", crew: "" }, { key: "B", crew: "Ana" }, { key: "C", crew: "" }];
  expect(list(tickets)).toEqual([{ title: "", tickets }]);
  expect(board(tickets)).toEqual([
    { title: "Needs a crew", tickets: [tickets[0], tickets[2]] },
    { title: "Crew assigned", tickets: [tickets[1]] },
  ]);
});

// The agent replay's log reads each call in a line: what was sent, short,
// and what came back, in a few words.
test("the agent log shows a call's arguments short, and puts a found ref where a step names it", async () => {
  const stage = await import("../bundle/Demos/logic/stage.ts");
  const tickets = [
    { key: "A-1", title: "One", state: "Open", crew: "" },
    { key: "A-2", title: "Two", state: "Closed", crew: "Ana" },
  ];
  expect(stage.argsText({})).toBe("{}");
  expect(stage.argsText({ target: "#dispatch", property: "tickets", value: tickets })).toBe('{ target: "#dispatch", property: "tickets", value: [2 × {key, title, state, crew}] }');
  expect(stage.argsText({ value: tickets.slice(0, 1) })).toBe('{ value: [{key: "A-1", title: "One", state: "Open", crew: ""}] }');
  expect(stage.withFound({ target: "$found", wait: 1 }, "@7")).toEqual({ target: "@7", wait: 1 });
});

test("a replay whose found ref is gone goes on from the find before the click that names it", async () => {
  const stage = await import("../bundle/Demos/logic/stage.ts");
  const steps = [
    { tool: "app_status", args: {} },
    { tool: "app_find", args: { locator: "role=button" } },
    { tool: "app_click", args: { target: "$found" } },
    { tool: "", args: {} },
  ];
  expect(stage.resumeAt(steps, 2, ""), "back to the find").toBe(1);
  expect(stage.resumeAt(steps, 2, "@7"), "a ref that still names it").toBe(2);
  expect(stage.resumeAt(steps, 3, ""), "a step that names no ref").toBe(3);
  expect(stage.resumeAt(steps, 4, ""), "at the end").toBe(4);
});

test("a find answered after a swap started finds nothing: the app it was found in is going", async () => {
  const stage = await import("../bundle/Demos/logic/stage.ts");
  const answer = stage.parsed(true, JSON.stringify({ structuredContent: { matches: [{ ref: "@4", role: "button", name: "Assign crew" }], count: 1 } }));
  expect(stage.foundAfter("", "app_find", true, answer, 2, 2), "no swap since it was sent").toBe("@4");
  expect(stage.foundAfter("", "app_find", true, answer, 2, 3), "a swap started on its way").toBe("");
  expect(stage.foundAfter("@1", "app_find", false, answer, 2, 2), "a find refused keeps what was found").toBe("@1");
  expect(stage.foundAfter("@1", "app_click", true, answer, 2, 2), "another tool keeps it").toBe("@1");
});

test("a replay given a step past its steps stays where it is", async () => {
  const stage = await import("../bundle/Demos/logic/stage.ts");
  const steps = [{ tool: "app_click", args: { target: "$found" } }];
  expect(stage.resumeAt(steps, -1, ""), "before the first").toBe(-1);
  expect(stage.resumeAt(steps, 0, ""), "no find before it").toBe(0);
});

test("the agent log says what each tool answered, and what a refusal said", async () => {
  const stage = await import("../bundle/Demos/logic/stage.ts");
  const answer = (structured, text = "") => stage.parsed(true, JSON.stringify({ structuredContent: structured, content: [{ type: "text", text }] }));
  expect(stage.summary("app_get_property", true, answer({ property: "unassigned", value: 0 }))).toBe("unassigned = 0");
  expect(stage.summary("app_set_property", true, answer({ property: "filters", previous: [], value: ["Open only"] }))).toBe('filters: [] → ["Open only"]');
  const found = answer({ matches: [{ ref: "@4", role: "button", name: "Open only" }], count: 1 });
  expect(stage.summary("app_find", true, found)).toBe("1 match · button “Open only” → @4");
  expect(stage.refOf(found)).toBe("@4");
  const refused = stage.parsed(false, JSON.stringify({ error: { code: "not_found", message: "no object #nope" } }));
  expect(stage.summary("app_click", false, refused)).toBe("not_found: no object #nope");
  const shot = stage.parsed(true, JSON.stringify({ structuredContent: { width: 320, height: 180 }, content: [{ type: "image", mimeType: "image/png", data: "AAAA" }] }));
  expect(shot.image).toBe("data:image/png;base64,AAAA");
  expect(stage.summary("app_screenshot", true, shot)).toBe("320×180 PNG");
});

test("the agent's card reads back as the declarative source its calls amount to", async () => {
  const stage = await import("../bundle/Demos/logic/stage.ts");
  const source = stage.sourceOf("North", ["Open only"], [{ key: "A-1", title: "One", state: "Open", crew: "" }], { "A-1": "Crew" });
  expect(source).toBe('DispatchCard {\n    heading: "North"\n    filters: ["Open only"]\n    tickets: [\n        { key: "A-1", state: "Open", crew: "Crew",\n          title: "One" },\n    ]\n}');
});
