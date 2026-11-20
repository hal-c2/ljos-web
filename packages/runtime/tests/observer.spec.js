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
  await page.waitForTimeout(500);
  const later = (await call(page, "app_frames", { since: frames.next_since, max: 600 })).result.structuredContent.frames;
  expect(later.map((frame) => frame.woke[0])).toEqual(expect.arrayContaining(["timer", "animation"]));
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

test("the Observer runs on the page, and shows the application's tree", async ({ page }) => {
  await opened(page, "inspectobserver");
  // The Overview's numbers come from app_metrics and app_processes.
  await expect(page.getByText("Objects", { exact: true }).first()).toBeVisible({ timeout: 15000 });
  await page.mouse.click(50, 50);
  await page.waitForFunction(() => window.objects.app.count === 1);
});
