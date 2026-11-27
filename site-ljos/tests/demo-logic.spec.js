// The demos' remix knobs are one-line edits a reader makes: whatever
// number they type, the demo keeps to what it can draw.
import { expect, test } from "@playwright/test";
import { diagnosticsOf, follow, paletteOf, PALETTES } from "../bundle/Demos/logic/shader.ts";

test("a Shader start palette out of range opens on one of the palettes the shader draws", () => {
  for (const choice of [-4, -1, 0, 2, 3, 5, 6, 7, 100, 1.4]) {
    const palette = paletteOf(choice);
    expect(palette, `startPalette ${choice}`).toBeGreaterThanOrEqual(0);
    expect(palette, `startPalette ${choice}`).toBeLessThan(PALETTES.length);
    expect(Number.isInteger(palette), `startPalette ${choice}`).toBe(true);
  }
  expect(paletteOf(4)).toBe(1);
  expect(paletteOf(-1)).toBe(2);
});

// The vortex eases after the pointer at the same pace whatever the frame
// rate, and more slowly under reduced motion, never jumping there.
test("the shader's vortex follows the pointer by time, not by frames, and slower when calm", () => {
  const from = { x: 0, y: 0 };
  const to = { x: 1, y: 1 };
  const once = follow(from, to, 0.1, false);
  let twice = follow(from, to, 0.05, false);
  twice = follow(twice, to, 0.05, false);
  expect(twice.x).toBeCloseTo(once.x, 6);
  expect(once.x).toBeGreaterThan(0);
  expect(once.x).toBeLessThan(1);
  const calm = follow(from, to, 0.1, true);
  expect(calm.x).toBeGreaterThan(0);
  expect(calm.x).toBeLessThan(once.x);
});

// What a GLSL compiler says of an edit is marked on the line it names.
test("a compiler's log is the editor's diagnostics, on the lines it names", () => {
  const source = "a\nb\nc\nd";
  const log = "ERROR: 0:3: 'nope' : undeclared identifier\nERROR: 0:99: '' : syntax error\nERROR: 2 compilation errors.  No code generated.\n";
  const found = diagnosticsOf(log, source);
  expect(found.map((d) => d.line), "the count at the end is no error of its own").toEqual([3, 4]);
  expect(found[0].message).toBe("'nope' : undeclared identifier");
  expect(found.every((d) => d.severity === "error" && d.column === 1)).toBe(true);
  expect(diagnosticsOf("", source)).toEqual([]);
  expect(diagnosticsOf("the browser has no WebGL 2 to draw a shader with", source)).toEqual([
    { message: "the browser has no WebGL 2 to draw a shader with", line: 1, column: 1, severity: "error" },
  ]);
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

// The replay goes on from a find only with what it found: one a swap
// took away on its way is asked again, of the app that runs now, before
// the step that names what it finds. Any other answer goes on.
test("a find a swap took away on its way is asked again before the step that names it", async () => {
  const stage = await import("../bundle/Demos/logic/stage.ts");
  expect(stage.findsAgain("app_find", true, 2, 3), "a swap started on its way").toBe(true);
  expect(stage.findsAgain("app_find", true, 2, 2), "no swap since it was sent").toBe(false);
  expect(stage.findsAgain("app_find", false, 2, 3), "a find refused goes on, as it said why").toBe(false);
  expect(stage.findsAgain("app_click", true, 2, 3), "another tool goes on").toBe(false);
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

// Motion's springs, stepped as SpringAnimation steps them: each tuning
// moves its own way, and reduced motion slows every one without a swing
// past the ring, and never holds it still.
test("Motion's springs differ: the bouncy one swings past the ring, the snappy one gets there first", async () => {
  const motion = await import("../bundle/Demos/logic/motion.ts");
  const peak = (tuning) => Math.max(...motion.trace(tuning, 0, 100, 4));
  const settled = (tuning) => motion.trace(tuning, 0, 100, 6).findIndex((_, i, all) => all.slice(i).every((v) => Math.abs(v - 100) < 1));
  const [snappy, bouncy, lazy] = [{ spring: 8, damping: 0.5 }, { spring: 3, damping: 0.07 }, { spring: 0.6, damping: 0.18 }];
  expect(peak(bouncy), "the bouncy spring swings well past").toBeGreaterThan(130);
  expect(peak(snappy), "the snappy spring barely passes").toBeLessThan(105);
  expect(settled(snappy), "the snappy spring settles before the lazy one").toBeLessThan(settled(lazy));
});

test("under reduced motion each spring is slower, never swings past, and still gets there", async () => {
  const motion = await import("../bundle/Demos/logic/motion.ts");
  for (const tuning of [{ spring: 8, damping: 0.5 }, { spring: 3, damping: 0.07 }, { spring: 0.6, damping: 0.18 }, { spring: 20, damping: 0.01 }]) {
    const calm = motion.tuned(tuning, true);
    const full = motion.trace(tuning, 0, 100, 0.2);
    const slow = motion.trace(calm, 0, 100, 0.2);
    expect(slow.at(-1), `${motion.said(tuning)} calmed is behind after 0.2 s`).toBeLessThan(full.at(-1));
    expect(slow.at(-1), `${motion.said(tuning)} calmed has moved after 0.2 s`).toBeGreaterThan(1);
    const whole = motion.trace(calm, 0, 100, 8);
    expect(Math.max(...whole), `${motion.said(tuning)} calmed never passes the ring`).toBeLessThanOrEqual(100.0001);
    expect(whole.at(-1), `${motion.said(tuning)} calmed arrives`).toBeGreaterThan(99);
    expect(motion.dampingRatio(calm)).toBeGreaterThanOrEqual(1);
  }
  expect(motion.tuned({ spring: 3, damping: 0.07 }, false)).toEqual({ spring: 3, damping: 0.07 });
});

test("Motion's ring hops round for ever and is never led past the stage's inset", async () => {
  const motion = await import("../bundle/Demos/logic/motion.ts");
  expect(motion.hop(motion.HOPS.length)).toEqual(motion.hop(0));
  expect(motion.hop(-1)).toEqual(motion.hop(motion.HOPS.length - 1));
  for (let i = 1; i < motion.HOPS.length * 2; i++) {
    const [a, b] = [motion.hop(i - 1), motion.hop(i)];
    expect(Math.hypot(a.x - b.x, a.y - b.y), `hop ${i} goes somewhere`).toBeGreaterThan(0.25);
  }
  for (const [x, y] of [[-50, -50], [0, 0], [200, 100], [999, 999]]) {
    const part = motion.partOf(x, y, 400, 200, 30);
    for (const v of [part.x, part.y]) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
    const px = motion.placeOf(part.x, 400, 30);
    expect(px).toBeGreaterThanOrEqual(30);
    expect(px).toBeLessThanOrEqual(370);
  }
  expect(motion.placeOf(motion.partOf(123, 0, 400, 200, 30).x, 400, 30)).toBeCloseTo(123);
  expect(motion.rope({ x: 0, y: 0 }, { x: 0, y: 10 })).toEqual({ length: 10, angle: 90 });
  // At rest the balls sit apart round the ring, none on another.
  const seats = [0, 1, 2].map((i) => motion.seat(i, 3, 40));
  for (const [i, a] of seats.entries()) {
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(40);
    for (const b of seats.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(60);
  }
  expect(motion.ballOn(1200, 640, 0.1)).toBe(64);
  expect(motion.ballOn(300, 200, 0.1)).toBe(26);
});
