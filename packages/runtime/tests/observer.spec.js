// `Ljos.Observer` on the web: an `Inspector` serves an item, and an
// `InspectorClient` given its token is answered from it, as `ljos observe`'s
// client is answered by the inspector of the application it observes: a
// serial at once, the answer later by `answered`, results in the
// inspector's shapes, and what a page cannot answer refused with why.
import { expect, test } from "./open.js";

const opened = async (page, scene = "inspectobserved") => {
  await page.goto(`/?scene=${scene}`);
  await page.waitForFunction(() => window.ready);
  await page.waitForFunction(() => window.objects.inspector.tokenFile !== "");
};

// Calls `tool` and waits for its answer: `{ ok, result }`, the result parsed
// when it is JSON.
const call = (page, tool, args = {}) =>
  page.evaluate(
    async ([tool, args]) => {
      const { client, root } = window.objects;
      const answers = window.scene.answers;
      const serial = client.call(tool, JSON.stringify(args));
      // Never inside the call.
      const early = answers.some((answer) => answer.serial === serial);
      while (!answers.some((answer) => answer.serial === serial)) await new Promise((done) => setTimeout(done, 5));
      void root;
      const { ok, result } = answers.find((answer) => answer.serial === serial);
      let parsed = result;
      try {
        parsed = JSON.parse(result);
      } catch {}
      return { early, ok, result: parsed };
    },
    [tool, args],
  );

test("a call is answered later, under the serial it returned", async ({ page }) => {
  await opened(page);
  const first = await call(page, "app_status");
  expect(first.early).toBe(false);
  expect(first.ok).toBe(true);
  expect(first.result.structuredContent.window_count).toBe(1);
  expect(await page.evaluate(() => window.objects.client.url)).toMatch(/^page:\/\/\d+$/);
  expect(await page.evaluate(() => [window.objects.client.connected, window.objects.client.pending])).toEqual([true, 0]);
});

test("the tree is the application's objects, with handles and ids", async ({ page }) => {
  await opened(page);
  const { result } = await call(page, "app_objects", { max: 3000 });
  const rows = result.structuredContent.objects;
  expect(rows[0]).toMatchObject({ depth: 0, type: "Rectangle", id: "app", object_name: "app", item: true });
  expect(rows[0].handle).toMatch(/^@\d+$/);
  const ids = rows.map((row) => row.id).filter(Boolean);
  expect(ids).toEqual(expect.arrayContaining(["app", "label", "area", "spinner", "tick"]));
  // Nothing of the client's own scene: only what is served.
  expect(ids).not.toContain("client");
  // A depth leaves out what is deeper, and says how much.
  const shallow = (await call(page, "app_objects", { max: 3000, depth: 0 })).result.structuredContent.objects;
  expect(shallow).toHaveLength(1);
  expect(shallow[0].hidden).toBe(rows[0].children);
  // Where each is written.
  expect(rows.find((row) => row.id === "label").at).toMatch(/inspectobserved\.qml:\d+$/);
});

test("an edit in the Observer changes the application, and Revert gives the binding back", async ({ page }) => {
  await opened(page);
  const seen = await call(page, "app_inspect", { target: "id=app" });
  const props = Object.fromEntries(seen.result.structuredContent.properties.map((p) => [p.name, p]));
  expect(props.count).toMatchObject({ type: "int", value: "0", provenance: "assigned" });
  expect(props.doubled).toMatchObject({ value: "0", provenance: "bound" });
  expect(seen.result.structuredContent.geometry).toEqual({ x: 0, y: 0, width: 300, height: 200 });

  const set = await call(page, "app_set_property", { target: "id=app", property: "count", value: 3, keep_binding: true });
  expect(set.ok).toBe(true);
  expect(await page.evaluate(() => [window.objects.app.count, window.objects.app.doubled])).toEqual([3, 6]);
  expect(await page.locator("text=n=3").count()).toBe(1);

  // A bound property given a value keeps its binding under it.
  await call(page, "app_set_property", { target: "id=app", property: "doubled", value: 100, keep_binding: true });
  expect(await page.evaluate(() => window.objects.app.doubled)).toBe(100);
  const back = await call(page, "app_set_property", { target: "id=app", property: "doubled", revert: true });
  expect(back.result.structuredContent.restored).toBe("binding");
  expect(await page.evaluate(() => window.objects.app.doubled)).toBe(6);

  // What the application does is read back.
  await page.evaluate(() => (window.objects.app.count = 5));
  expect((await call(page, "app_get_property", { target: "id=app", property: "count" })).result.structuredContent.value).toBe("5");
});

test("a pass is counted when input changes the application, and a watch waits for one", async ({ page }) => {
  await opened(page);
  const before = (await call(page, "app_watch", {})).result.structuredContent.counts;
  // A watch on the counts as they are holds until something moves.
  const waiting = call(page, "app_watch", { since: before, wait_ms: 10000 });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scene.answers.length)).toBe(1);
  await page.mouse.click(20, 70);
  const woke = (await waiting).result.structuredContent;
  expect(woke.changed).toEqual(expect.arrayContaining(["frames", "paints"]));
  const frames = (await call(page, "app_frames", { max: 600 })).result.structuredContent;
  expect(frames.frames.at(-1).woke).toEqual(["input"]);
  expect(frames.summary.total_us.max).toBeGreaterThanOrEqual(0);
  // A timer's step is a timer's pass, an animation's an animation's.
  await page.evaluate(() => window.scene.tickOnce());
  await page.waitForFunction(() => window.objects.app.count === 1);
  await page.evaluate(() => window.scene.spinOnce());
  // Until the passes they made are counted, not for a time that may be short.
  await expect
    .poll(async () => (await call(page, "app_frames", { since: frames.next_since, max: 600 })).result.structuredContent.frames.map((frame) => frame.woke[0]), { timeout: 10_000 })
    .toEqual(expect.arrayContaining(["timer", "animation"]));
});

// The Observer's Frames page lists each pass's binding runs and text
// layouts as counts, as the native inspector answers them; at rest none
// run, so none are counted.
test("a pass says how many bindings it ran and how much text it laid out", async ({ page }) => {
  await opened(page);
  await page.waitForTimeout(300);
  const { next_since } = (await call(page, "app_frames", { max: 600 })).result.structuredContent;
  await page.mouse.click(20, 70);
  await page.waitForFunction(() => window.objects.app.count === 1);
  await page.waitForTimeout(200);
  const frames = (await call(page, "app_frames", { since: next_since, max: 600 })).result.structuredContent.frames;
  const pressed = frames.find((frame) => frame.woke[0] === "input");
  expect(pressed.binding_runs).toBeGreaterThan(0);
  expect(pressed.text_layouts).toBeGreaterThan(0);
  for (const frame of frames) {
    expect(Number.isInteger(frame.binding_runs) && Number.isInteger(frame.text_layouts)).toBe(true);
  }
});

test("a watch on a picked item wakes for a pass that changed it, as the Observer's Objects page asks", async ({ page }) => {
  await opened(page);
  const rows = (await call(page, "app_objects", { max: 3000 })).result.structuredContent.objects;
  const app = rows.find((row) => row.id === "app").handle;
  const spinner = rows.find((row) => row.id === "spinner").handle;
  // The Observer's first watch of an item: its count now, at once.
  const first = (await call(page, "app_watch", { items: [app] })).result.structuredContent.counts;
  expect(first.items).toEqual({ [app]: 0 });
  const since = { logs: first.logs, reloads: first.reloads, traces: first.traces, items: first.items };
  const waiting = call(page, "app_watch", { since, items: [app], wait_ms: 10000 });
  // The spinner's own watch: a press that changes only the label is not its.
  const still = (await call(page, "app_watch", { items: [spinner] })).result.structuredContent.counts;
  const aside = call(page, "app_watch", { since: { logs: still.logs, items: still.items }, items: [spinner], wait_ms: 1500 });
  await page.mouse.click(20, 70);
  const woke = (await waiting).result.structuredContent;
  expect(woke.changed).toEqual(["items"]);
  expect(woke.counts.items[app]).toBeGreaterThan(0);
  expect((await aside).result.structuredContent.changed).toEqual([]);
});

test("a holder waits on one watch at a time: asking again answers the one it had out", async ({ page }) => {
  await opened(page);
  const counts = (await call(page, "app_watch", {})).result.structuredContent.counts;
  const since = { paints: counts.paints, logs: counts.logs };
  const earlier = call(page, "app_watch", { since, wait_ms: 3_600_000, holder: "observer" });
  const other = call(page, "app_watch", { since, wait_ms: 1500, holder: "someone else" });
  await page.waitForTimeout(300);
  // The same holder, following something else now (as the Observer does
  // once an item is picked): the watch it had out is told nothing changed.
  const later = call(page, "app_watch", { since, wait_ms: 1500, holder: "observer" });
  const told = (await earlier).result.structuredContent;
  expect(told.changed).toEqual([]);
  expect(told.waited).toBeLessThan(1000);
  expect((await later).result.structuredContent.waited).toBeGreaterThanOrEqual(1400);
  // Another holder's is its own.
  expect((await other).result.structuredContent.waited).toBeGreaterThanOrEqual(1400);
});

test("a holder asking for the counts as they are answers the watch it had out", async ({ page }) => {
  await opened(page);
  const counts = (await call(page, "app_watch", {})).result.structuredContent.counts;
  const earlier = call(page, "app_watch", { since: { paints: counts.paints }, wait_ms: 3_600_000, holder: "observer" });
  await page.waitForTimeout(200);
  // As the Observer asks when an item is picked: no counts to compare with.
  expect((await call(page, "app_watch", { holder: "observer" })).ok).toBe(true);
  expect((await earlier).result.structuredContent.waited).toBeLessThan(1000);
});

// The runtime counts the work of the whole page: with two applications
// served, what a pass ran is no one application's to be told as its.
test("with two applications served a pass does not say what bindings it ran", async ({ page }) => {
  await opened(page);
  await page.evaluate(() => (window.objects.otherInspector.target = window.objects.other));
  const { next_since } = (await call(page, "app_frames", { max: 600 })).result.structuredContent;
  await page.mouse.click(20, 70);
  await page.waitForFunction(() => window.objects.app.count === 1);
  await expect.poll(async () => (await call(page, "app_frames", { since: next_since, max: 600 })).result.structuredContent.frames.length).toBeGreaterThan(0);
  const frames = (await call(page, "app_frames", { since: next_since, max: 600 })).result.structuredContent.frames;
  for (const frame of frames) expect([frame.binding_runs, frame.text_layouts]).toEqual([null, null]);
});

test("at rest nothing is counted, and a watch holds until its wait is over", async ({ page }) => {
  await opened(page);
  await page.waitForTimeout(300);
  const counts = (await call(page, "app_watch", {})).result.structuredContent.counts;
  const held = await call(page, "app_watch", { since: counts, wait_ms: 1500 });
  expect(held.result.structuredContent.changed).toEqual([]);
  expect(held.result.structuredContent.waited).toBeGreaterThanOrEqual(1400);
  expect(held.result.structuredContent.counts.frames).toBe(counts.frames);
  expect(held.result.structuredContent.rest.at_rest).toBe(true);
});

test("a line logged wakes a watch, and the logs say it", async ({ page }) => {
  await opened(page);
  const counts = (await call(page, "app_watch", {})).result.structuredContent.counts;
  const waiting = call(page, "app_watch", { since: counts, wait_ms: 10000 });
  await page.waitForTimeout(100);
  await page.evaluate(() => window.scene.say("hello from the app"));
  expect((await waiting).result.structuredContent.changed).toContain("logs");
  const logs = (await call(page, "app_logs", { since: counts.logs })).result.structuredContent;
  expect(logs.entries.map((entry) => entry.message)).toContain("hello from the app");
});

test("a picture of the application is a PNG of it", async ({ page }) => {
  await opened(page);
  const shot = await call(page, "app_screenshot", { max_size: 640 });
  expect(shot.ok).toBe(true);
  const image = shot.result.content.find((part) => part.type === "image");
  expect(image.mimeType).toBe("image/png");
  expect(Buffer.from(image.data, "base64").subarray(1, 4).toString()).toBe("PNG");
  expect(shot.result.structuredContent.width).toBeGreaterThan(0);
});

test("what a page cannot answer is refused with why", async ({ page }) => {
  await opened(page);
  for (const tool of ["app_trace", "app_audit"]) {
    const refused = await call(page, tool, {});
    expect(refused.ok).toBe(false);
    expect(refused.result.error).toMatchObject({ code: "unsupported" });
    expect(refused.result.error.message).toContain("web");
  }
  const mailboxes = await call(page, "app_processes", { kind: "mailbox" });
  expect(mailboxes.ok).toBe(false);
  expect(mailboxes.result.error.code).toBe("unsupported");
  const binding = await call(page, "app_set_property", { target: "id=app", property: "count", binding: "1 + 1" });
  expect(binding.result.error.code).toBe("unsupported");
  // An object that is not there is the inspector's not_found.
  expect((await call(page, "app_inspect", { target: "id=nobody" })).result.error.code).toBe("not_found");
});

test("the processes are this page's one thread and its timers", async ({ page }) => {
  await opened(page);
  const { structuredContent } = (await call(page, "app_processes", {})).result;
  expect(structuredContent.process.threads).toBe(1);
  // The number the page serves it under stands for its pid.
  expect(`page://${structuredContent.process.pid}`).toBe(await page.evaluate(() => window.objects.client.url));
  expect(structuredContent.processes.filter((row) => row.kind === "thread")).toHaveLength(1);
  expect(structuredContent.processes.find((row) => row.kind === "timer")).toMatchObject({ name: "tick", interval_ms: 50 });
});

test("with no inspector served the client says it is not connected", async ({ page }) => {
  await opened(page);
  await page.evaluate(() => (window.objects.inspector.target = null));
  const answer = await call(page, "app_status");
  expect(answer.ok).toBe(false);
  expect(answer.result).toContain("tokenFile");
  expect(await page.evaluate(() => [window.objects.client.connected, window.objects.client.error !== ""])).toEqual([false, true]);
  // Served again, under a new token: the client follows the token it is given.
  await page.evaluate(() => (window.objects.inspector.target = window.objects.app));
  expect((await call(page, "app_status")).ok).toBe(true);
});

// Handles are the page's, but what a client may ask of is what its token
// serves: an object of another application on the page is not its to
// read or change.
test("a handle of another served application is refused", async ({ page }) => {
  await opened(page);
  const ask = (token) => page.evaluate((token) => (window.objects.client.tokenFile = token), token);
  const mine = await page.evaluate(() => window.objects.inspector.tokenFile);
  await ask(await page.evaluate(() => (window.objects.otherInspector.target = window.objects.other) && window.objects.otherInspector.tokenFile));
  const theirs = (await call(page, "app_objects", { max: 3000 })).result.structuredContent.objects.find((row) => row.id === "otherLabel").handle;
  expect((await call(page, "app_inspect", { target: theirs })).ok).toBe(true);
  await ask(mine);
  for (const [tool, args] of [
    ["app_inspect", { target: theirs }],
    ["app_set_property", { target: theirs, property: "text", value: "taken" }],
    ["app_watch", { items: [theirs] }],
  ]) {
    const refused = await call(page, tool, args);
    expect(refused.ok).toBe(false);
    expect(refused.result.error.code).toBe("not_found");
  }
  expect(await page.evaluate(() => window.objects.other.children[0].text)).toBe("other");
});

test("an edit of a grouped property is taken back by Revert", async ({ page }) => {
  await opened(page);
  const bold = () => page.evaluate(() => window.objects.app.children[0].font.bold);
  expect(await bold()).toBe(false);
  expect((await call(page, "app_set_property", { target: "id=label", property: "font.bold", value: true })).ok).toBe(true);
  expect(await bold()).toBe(true);
  const edited = (await call(page, "app_inspect", { target: "id=label" })).result.structuredContent.properties.find((p) => p.name === "font.bold");
  expect(edited).toMatchObject({ value: "true", assigned_by: "devtools" });
  const back = await call(page, "app_set_property", { target: "id=label", property: "font.bold", revert: true });
  expect(back.ok).toBe(true);
  expect(back.result.structuredContent).toMatchObject({ value: "false", previous: "true", restored: "value" });
  expect(await bold()).toBe(false);
  // Nothing of the client's is left on it.
  const after = (await call(page, "app_inspect", { target: "id=label", all: true })).result.structuredContent.properties.find((p) => p.name === "font.bold");
  expect(after.assigned_by).toBeUndefined();
});

test("a call is answered by the application its token named when it was made", async ({ page }) => {
  await opened(page);
  const answer = await page.evaluate(async () => {
    const { client, otherInspector, other } = window.objects;
    otherInspector.target = other;
    const answers = window.scene.answers;
    const serial = client.call("app_set_property", JSON.stringify({ target: "id=app", property: "count", value: 9 }));
    // The client is given another token before the call is answered.
    client.tokenFile = otherInspector.tokenFile;
    while (!answers.some((each) => each.serial === serial)) await new Promise((done) => setTimeout(done, 5));
    return answers.find((each) => each.serial === serial);
  });
  expect(answer.ok).toBe(false);
  expect(answer.result).toContain("token");
  expect(await page.evaluate(() => window.objects.app.count)).toBe(0);
});

// A holder that moves the Observer from one application to another gives
// the Inspector the other's root, log and title: what the Observer shows is
// then all the other's, its log and frames included.
test("an Inspector given another log or title serves its target anew", async ({ page }) => {
  await opened(page);
  const first = await page.evaluate(() => window.objects.inspector.tokenFile);
  const title = async () => (await call(page, "app_status")).result.structuredContent.windows[0].title;
  expect(await title()).toBe("app");
  await page.evaluate(() => {
    const { inspector, other } = window.objects;
    const line = { level: "info", category: "default", message: "from the other", file: null, line: null };
    inspector.logs = { lines: (since, limit) => [{ seq: 0, line }].filter(({ seq }) => seq >= since).slice(0, limit), count: () => 1, listen: () => () => {} };
    inspector.title = "the other";
    inspector.target = other;
  });
  const second = await page.evaluate(() => window.objects.inspector.tokenFile);
  expect(second).not.toBe(first);
  expect(second).not.toBe("");
  expect(await title()).toBe("the other");
  const logs = (await call(page, "app_logs", {})).result.structuredContent.entries.map((entry) => entry.message);
  expect(logs).toEqual(["from the other"]);
  const ids = (await call(page, "app_objects", { max: 3000 })).result.structuredContent.objects.map((row) => row.id);
  expect(ids).toContain("otherLabel");
  expect(ids).not.toContain("label");
});

// The page's instance of the Observer's module, for what only it can say.
const observerModule = () => performance.getEntriesByType("resource").find(({ name }) => /\/Ljos\/Observer\/index\.ts(\?|$)/.test(name)).name;

test("a handle named before a reload is stale, though its object is still there", async ({ page }) => {
  await opened(page);
  const named = async () => (await call(page, "app_objects", { max: 3000 })).result.structuredContent.objects.find((row) => row.id === "label").handle;
  const before = await named();
  // Reloaded twice, back to the same root: the label is still there.
  await page.evaluate(() => {
    const { inspector, other, app } = window.objects;
    inspector.target = other;
    inspector.target = app;
  });
  const stale = await call(page, "app_inspect", { target: before });
  expect(stale.ok).toBe(false);
  expect(stale.result.error.code).toBe("stale_ref");
  expect(stale.result.error.message).toContain("reloaded");
  // Listed again, it is asked of.
  expect((await call(page, "app_inspect", { target: await named() })).ok).toBe(true);
});

test("Revert gives back the value the application had before the Observer's edit", async ({ page }) => {
  await opened(page);
  await page.evaluate(() => (window.objects.app.count = 5));
  expect((await call(page, "app_set_property", { target: "id=app", property: "count", value: 9 })).ok).toBe(true);
  expect(await page.evaluate(() => window.objects.app.count)).toBe(9);
  const back = await call(page, "app_set_property", { target: "id=app", property: "count", revert: true });
  expect(back.ok).toBe(true);
  expect(back.result.structuredContent.restored).toBe("value");
  expect(await page.evaluate(() => window.objects.app.count)).toBe(5);
});

test("Revert of what the Observer did not change is refused, and changes nothing", async ({ page }) => {
  await opened(page);
  await page.evaluate(() => (window.objects.app.count = 5));
  const refused = await call(page, "app_set_property", { target: "id=app", property: "count", revert: true });
  expect(refused.ok).toBe(false);
  expect(refused.result.error.code).toBe("not_actionable");
  expect(await page.evaluate(() => window.objects.app.count)).toBe(5);
});

test("Revert after the application wrote the value again keeps the application's", async ({ page }) => {
  await opened(page);
  await call(page, "app_set_property", { target: "id=app", property: "count", value: 9 });
  await page.evaluate(() => (window.objects.app.count = 7));
  const back = await call(page, "app_set_property", { target: "id=app", property: "count", revert: true });
  expect(back.ok).toBe(true);
  expect(back.result.structuredContent.restored).toBe("none");
  expect(await page.evaluate(() => window.objects.app.count)).toBe(7);
});

test("an alias is listed, read and changed as the member it names, and Revert gives its binding back", async ({ page }) => {
  await opened(page);
  const listed = (await call(page, "app_inspect", { target: "id=app" })).result.structuredContent.properties.find((p) => p.name === "caption");
  expect(listed).toMatchObject({ value: "n=0" });
  expect((await call(page, "app_get_property", { target: "id=app", property: "caption" })).result.structuredContent.value).toBe("n=0");
  expect((await call(page, "app_set_property", { target: "id=app", property: "caption", value: "hello" })).ok).toBe(true);
  expect(await page.evaluate(() => window.objects.app.children[0].text)).toBe("hello");
  const back = await call(page, "app_set_property", { target: "id=app", property: "caption", revert: true });
  expect(back.result.structuredContent.restored).toBe("binding");
  await page.evaluate(() => window.objects.app.count++);
  expect(await page.evaluate(() => window.objects.app.children[0].text)).toBe("n=1");
});

// The item's own `visible` and `enabled` say whether it is shown and takes
// input; a file's of the same name are its values, edited as any other.
test("an item whose file declares its own visible and enabled is told as shown and enabled", async ({ page }) => {
  await opened(page);
  const row = (await call(page, "app_objects", { max: 3000 })).result.structuredContent.objects.find((each) => each.id === "shown");
  expect(row.visible).toBe(true);
  const seen = (await call(page, "app_inspect", { target: "id=shown" })).result.structuredContent;
  expect(seen.state).toMatchObject({ visible: true, enabled: true });
  expect(seen.properties.find((p) => p.name === "visible")).toMatchObject({ value: "false" });
  expect((await call(page, "app_screenshot", { target: "id=shown" })).ok).toBe(true);
});

// What changed the page just before a step of the clock, in the same task,
// has its records delivered before the step's own: with them come what the
// step changed, which is the clock's pass.
test("a pass the clock stepped in is the clock's, though something changed the page just before it", async ({ page }) => {
  await page.goto("/?scene=inspectobserved&still");
  await page.waitForFunction(() => window.ready);
  await page.waitForFunction(() => window.objects.inspector.tokenFile !== "");
  const { next_since } = (await call(page, "app_frames", { max: 600 })).result.structuredContent;
  await page.evaluate(() => {
    window.objects.app.$node.setAttribute("data-poked", "yes");
    window.scene.tickOnce();
    window.clock.advance(60);
  });
  expect(await page.evaluate(() => window.objects.app.count)).toBe(1);
  await expect
    .poll(async () => (await call(page, "app_frames", { since: next_since, max: 600 })).result.structuredContent.frames.map((frame) => frame.woke[0]))
    .toEqual(["timer"]);
});

test("a call is refused when what its token serves is reloaded before it is answered", async ({ page }) => {
  await opened(page);
  const answer = await page.evaluate(async () => {
    const { client, inspector, other, app } = window.objects;
    const answers = window.scene.answers;
    const serial = client.call("app_set_property", JSON.stringify({ target: "id=app", property: "count", value: 9 }));
    // Reloaded under the same token before the call is asked.
    inspector.target = other;
    inspector.target = app;
    while (!answers.some((each) => each.serial === serial)) await new Promise((done) => setTimeout(done, 5));
    return answers.find((each) => each.serial === serial);
  });
  expect(answer.ok).toBe(false);
  expect(answer.result).toContain("reloaded");
  expect(await page.evaluate(() => window.objects.app.count)).toBe(0);
});

test("a watch answered after the client moved to another token says nothing of that token", async ({ page }) => {
  await opened(page);
  const since = (await call(page, "app_watch", {})).result.structuredContent.counts;
  const told = await page.evaluate(async (since) => {
    const { client } = window.objects;
    const answers = window.scene.answers;
    const answered = async (serial) => {
      while (!answers.some((each) => each.serial === serial)) await new Promise((done) => setTimeout(done, 5));
      return answers.find((each) => each.serial === serial);
    };
    const watch = client.call("app_watch", JSON.stringify({ since, wait_ms: 800 }));
    await new Promise((done) => setTimeout(done, 100));
    client.tokenFile = "nothing-served";
    await answered(client.call("app_status", "{}"));
    const moved = [client.connected, client.error !== ""];
    const late = await answered(watch);
    return { moved, late: late.ok, after: [client.connected, client.error !== ""], pending: client.pending };
  }, since);
  expect(told.moved).toEqual([false, true]);
  expect(told.late).toBe(true);
  expect(told.after).toEqual([false, true]);
  expect(told.pending).toBe(0);
});

test("an item no watch has asked of for a minute is no longer followed, with no watch to ask again", async ({ page }) => {
  await opened(page);
  const app = (await call(page, "app_objects", { max: 3000 })).result.structuredContent.objects.find((row) => row.id === "app").handle;
  await call(page, "app_watch", { items: [app] });
  const address = await page.evaluate(observerModule);
  const followed = () => page.evaluate(async (address) => (await import(address)).followedItems(window.objects.inspector.tokenFile), address);
  expect(await followed()).toBe(1);
  // A minute on, by the page's clock, and a pass.
  await page.evaluate(() => {
    const real = performance.now.bind(performance);
    performance.now = () => real() + 61_000;
  });
  await page.mouse.click(20, 70);
  await page.waitForFunction(() => window.objects.app.count === 1);
  await expect.poll(followed).toBe(0);
});

test("handles of objects gone are let go of, whatever asks for handles", async ({ page }) => {
  await opened(page);
  const address = await page.evaluate(observerModule);
  const held = () => page.evaluate(async (address) => (await import(address)).heldHandles(), address);
  const before = await held();
  // Each round the application makes an object and lets the one before
  // go, and the Observer is told it through app_inspect alone.
  for (let round = 0; round < 200; round++) {
    await page.evaluate(() => window.scene.churn());
    expect((await call(page, "app_inspect", { target: "id=app" })).ok).toBe(true);
  }
  expect((await held()) - before).toBeLessThan(150);
});

test("the Observer runs on the page, and shows the application's tree", async ({ page }) => {
  await opened(page, "inspectobserver");
  // The Overview's numbers come from app_metrics and app_processes.
  await expect(page.getByText("Objects", { exact: true }).first()).toBeVisible({ timeout: 15000 });
  await page.mouse.click(50, 50);
  await page.waitForFunction(() => window.objects.app.count === 1);
  // The Objects page lists the application's own items.
  await page.getByRole("tab", { name: "Objects", exact: true }).first().click();
  await expect(page.getByText(/\blabel\b/).first()).toBeVisible({ timeout: 15000 });
});

// The page's instance of a runtime module, by the end of its address.
const moduleAt = (page, end) => page.evaluate((end) => performance.getEntriesByType("resource").find(({ name }) => name.split("?")[0].endsWith(end)).name, end);

test("Revert after the application wrote over the Observer's edit, and the Observer edited again, gives back the application's", async ({ page }) => {
  await opened(page);
  await page.evaluate(() => (window.objects.app.count = 5));
  await call(page, "app_set_property", { target: "id=app", property: "count", value: 9 });
  await page.evaluate(() => (window.objects.app.count = 7));
  await call(page, "app_set_property", { target: "id=app", property: "count", value: 11 });
  const back = await call(page, "app_set_property", { target: "id=app", property: "count", revert: true });
  expect(back.result.structuredContent.restored).toBe("value");
  expect(await page.evaluate(() => window.objects.app.count)).toBe(7);
});

test("an alias of an alias is changed as what it ends at, and Revert gives its binding back", async ({ page }) => {
  await opened(page);
  expect((await call(page, "app_set_property", { target: "id=app", property: "outer", value: "far" })).ok).toBe(true);
  expect(await page.evaluate(() => window.objects.app.children[0].text)).toBe("far");
  const back = await call(page, "app_set_property", { target: "id=app", property: "outer", revert: true });
  expect(back.ok).toBe(true);
  expect(back.result.structuredContent.restored).toBe("binding");
  await page.evaluate(() => window.objects.app.count++);
  expect(await page.evaluate(() => window.objects.app.children[0].text)).toBe("n=1");
});

test("what holds no value of its own is not edited, and is told so", async ({ page }) => {
  await opened(page);
  const set = await call(page, "app_set_property", { target: "id=app", property: "held", value: null });
  expect(set.ok).toBe(false);
  expect(set.result.error.code).toBe("not_actionable");
  expect(set.result.error.message).toContain("no value of its own");
  expect(await page.evaluate(() => window.objects.app.held === window.objects.app.children[0])).toBe(true);
});

test("a property with an override over it is not edited, and the override stays", async ({ page }) => {
  await opened(page);
  const address = await moduleAt(page, "/object.ts");
  await page.evaluate(async (address) => {
    const { override } = await import(address);
    window.layered = override(window.objects.app, "doubled", { binding: (below) => below() + 1 });
  }, address);
  expect(await page.evaluate(() => window.objects.app.doubled)).toBe(1);
  const set = await call(page, "app_set_property", { target: "id=app", property: "doubled", value: 50 });
  expect(set.ok).toBe(false);
  expect(set.result.error.message).toContain("override");
  await page.evaluate(() => window.objects.app.count++);
  expect(await page.evaluate(() => window.objects.app.doubled)).toBe(3);
});

test("a file's own scalar over a group its type has is one property", async ({ page }) => {
  await opened(page);
  const listed = (await call(page, "app_inspect", { target: "id=fonted" })).result.structuredContent.properties.map((p) => p.name);
  expect(listed).toContain("font");
  expect(listed).not.toContain("font.bold");
  expect((await call(page, "app_get_property", { target: "id=fonted", property: "font" })).result.structuredContent.value).toBe("serif");
});

test("a watch its wait ends while it settles is not told as settled", async ({ page }) => {
  await opened(page);
  const since = (await call(page, "app_watch", {})).result.structuredContent.counts;
  const told = await page.evaluate(async (since) => {
    const { client } = window.objects;
    const answers = window.scene.answers;
    const serial = client.call("app_watch", JSON.stringify({ since, wait_ms: 300, settle_ms: 1000 }));
    await new Promise((done) => setTimeout(done, 100));
    window.scene.say("soon after");
    while (!answers.some((each) => each.serial === serial)) await new Promise((done) => setTimeout(done, 5));
    return JSON.parse(answers.find((each) => each.serial === serial).result).structuredContent;
  }, since);
  expect(told.changed).toContain("logs");
  expect(told.settled).toBe(false);
  expect(told.waited).toBeLessThan(900);
});

test("a served root that is not shown is told as not shown", async ({ page }) => {
  await opened(page);
  expect((await call(page, "app_status")).result.structuredContent.windows[0].visible).toBe(true);
  await page.evaluate(() => (window.objects.app.visible = false));
  expect((await call(page, "app_status")).result.structuredContent.windows[0].visible).toBe(false);
});

// Asks `tool` of the root `token` serves, and gives the client back its own.
const callOf = (page, token, tool, args = {}) =>
  page.evaluate(
    async ([token, tool, args]) => {
      const { client } = window.objects;
      const answers = window.scene.answers;
      const own = client.tokenFile;
      client.tokenFile = token;
      const serial = client.call(tool, JSON.stringify(args));
      while (!answers.some((each) => each.serial === serial)) await new Promise((done) => setTimeout(done, 5));
      client.tokenFile = own;
      return JSON.parse(answers.find((each) => each.serial === serial).result).structuredContent;
    },
    [token, tool, args],
  );

test("one input that changes two served roots is each one's input", async ({ page }) => {
  await opened(page);
  await page.evaluate(() => (window.objects.otherInspector.target = window.objects.other));
  const tokens = await page.evaluate(() => [window.objects.inspector.tokenFile, window.objects.otherInspector.tokenFile]);
  await page.evaluate(() =>
    window.addEventListener("pointerdown", () => {
      window.objects.app.$node.setAttribute("data-pressed", String(Math.random()));
      window.objects.other.$node.setAttribute("data-pressed", String(Math.random()));
    }),
  );
  await page.mouse.click(395, 295);
  for (const token of tokens) {
    await expect.poll(async () => (await callOf(page, token, "app_frames", { max: 600 })).frames.at(-1)?.woke[0]).toBe("input");
  }
});

test("work done while two roots were served is not the one left's", async ({ page }) => {
  await opened(page);
  const address = await moduleAt(page, "/object.ts");
  await page.evaluate(() => (window.objects.otherInspector.target = window.objects.other));
  await page.evaluate(() => window.objects.app.$node.setAttribute("data-first", "yes"));
  await expect.poll(async () => (await call(page, "app_frames", { max: 600 })).result.structuredContent.frames.length).toBeGreaterThan(0);
  await page.evaluate(async (address) => {
    const { work } = await import(address);
    // The other's work, while both are served.
    work.bindingRuns += 10_000;
    window.objects.otherInspector.target = null;
    window.objects.app.$node.setAttribute("data-after", "yes");
  }, address);
  await expect
    .poll(async () => (await call(page, "app_frames", { max: 600 })).result.structuredContent.frames.at(-1).binding_runs)
    .not.toBeNull();
  const last = (await call(page, "app_frames", { max: 600 })).result.structuredContent.frames.at(-1);
  expect(last.binding_runs).toBeLessThan(10_000);
});

test("a root whose log cannot be listened to is not served, and leaves the page as it was", async ({ page }) => {
  await opened(page);
  const address = await page.evaluate(observerModule);
  const left = await page.evaluate(async (address) => {
    const { serve } = await import(address);
    window.objects.inspector.target = null;
    const frame = window.requestAnimationFrame;
    let refused = "";
    try {
      serve(window.objects.other, { logs: { lines: () => [], count: () => 0, listen: () => { throw new Error("no log"); } } });
    } catch (error) {
      refused = error.message;
    }
    return { refused, same: window.requestAnimationFrame === frame };
  }, address);
  expect(left).toEqual({ refused: "no log", same: true });
});

test("a root closed whose log fails to stop is closed all the same", async ({ page }) => {
  await opened(page);
  const address = await page.evaluate(observerModule);
  const left = await page.evaluate(async (address) => {
    const { serve } = await import(address);
    window.objects.inspector.target = null;
    const frame = window.requestAnimationFrame;
    const served = serve(window.objects.other, { logs: { lines: () => [], count: () => 0, listen: () => () => { throw new Error("stuck"); } } });
    const hooked = window.requestAnimationFrame !== frame;
    let failed = "";
    try {
      served.close();
    } catch (error) {
      failed = error.message;
    }
    return { hooked, failed, same: window.requestAnimationFrame === frame };
  }, address);
  expect(left).toEqual({ hooked: true, failed: "stuck", same: true });
});
