// What a reader does with an example that answers input, and what they
// then see: by page and the example's place on it (the docs are pinned,
// site/ljos-ui.sha). An example not named here is driven generically
// (examples.spec.js): its control pressed, or a press, a drag, a key and
// a pinch on it, none of which may throw.
//
// `act(context)` gets `{ page, stage, at }`, where `at(fx, fy)` is the
// point at that fraction of the running example's own size (the stage
// is wider than most examples, which stand at its left edge); `expect`
// is what changes once the reader has acted: "text" (its words),
// "look" (its signature: elements, words, styles), or a function
// checking it outright: it gets the words and `{ page, stage }`. A
// Dialog or a Menu opens in its window's overlay, as in Qt, which is
// the page's, not the stage's: what it shows is looked for on the page.
// `fails` names the audit's reason it fails now (it runs as `test.fail`).
import { drag, pinch, press } from "./fixtures.js";

// A press where a finger lands: the example's own press areas lie over
// its controls, so a click aimed at the element would be refused.
const button = (name) => async ({ stage }) => press(stage.getByRole("button", { name }));
// A tap on the example's own middle: a Tap controller has no element
// of its own to aim at.
const tap = async ({ page, at }) => {
  const { x, y } = await at(0.5, 0.5);
  await page.mouse.click(x, y);
};
// An example whose point is the value it draws: nothing to do but read.
const reads = async () => {};
// A press on what an example's popup shows, where the popup is.
const choose = (role, name) => async ({ page }) => press(page.getByRole(role, { name, exact: true }));
const after = (...steps) => async (context) => {
  for (const step of steps) await step(context);
};

export const interactions = {
  "/start/hot-reload/#0": { act: button("Change label"), expect: "text" },
  "/ui/layouts/#3": { act: button("Second"), expect: "look" },
  "/ui/text-input/#1": {
    // A double-click selects a word of the read-only field, and the
    // line below it says which.
    act: async ({ page, at }) => {
      const { x, y } = await at(0.1, 0.12);
      await page.mouse.dblclick(x, y);
    },
    expect: (text) => /Selected: \S/.test(text),
  },
  "/ui/text-input/#2": {
    act: async ({ page, stage }) => {
      await press(stage.locator("input").first());
      await page.keyboard.type("42");
    },
    expect: "look",
  },
  "/ui/text-input/#3": {
    act: async ({ page, stage }) => {
      await press(stage.locator("input,textarea").first());
      await page.keyboard.type("ljós");
    },
    expect: "look",
  },
  "/ui/animation/#1": { act: button("Move the square"), expect: "look" },
  "/ui/animation/#2": { act: button("Send the ball here"), expect: "look" },
  // Its button opens a Dialog, whose standard buttons the style's box
  // makes.
  "/controls/accessibility/#2": {
    act: button("Close"),
    expect: (text, { page }) => page.getByRole("dialog", { name: "Save?" }).getByRole("button", { name: "OK" }).isVisible(),
  },
  "/controls/containers-and-popups/#1": { act: after(button("Delete"), choose("button", "OK")), expect: (text) => text.includes("Deleted") },
  // The first tab is the current one: the other is the press that shows.
  "/controls/containers-and-popups/#2": { act: async ({ stage }) => press(stage.getByRole("tab", { name: "Sent" })), expect: "look" },
  "/controls/containers-and-popups/#4": { act: after(button("File"), choose("menuitem", "Open")), expect: (text) => text.includes("Open chosen") },
  "/controls/value-inputs/#0": {
    // The volume handle dragged to the right (it starts at 25 %).
    act: async ({ page, stage }) => {
      const box = await stage.getByRole("slider").first().boundingBox();
      const y = box.y + box.height / 2;
      await drag(page, { x: box.x + box.width * 0.25, y }, { x: box.x + box.width * 0.6, y });
    },
    expect: "look",
  },
  "/data/pointer-input/#1": { act: button("Box"), expect: "look" },
  "/data/pointer-input/#3": {
    // The box dragged onto the drop area says so.
    act: async ({ page, at }) => drag(page, await at(0.066, 0.066), await at(0.7, 0.7), 16),
    expect: (text) => /entered|dropped/.test(text),
    fails: "audit: the box has no drag target, so a drag never moves it and its hot spot never reaches the DropArea, which never says 'entered' (the docs example's, as in Qt); the page no longer takes the drag",
  },
  "/data/pointer-input/#4": {
    act: async ({ page, at }) => {
      const { x, y } = await at(0.5, 0.5);
      await pinch(page, x, y);
    },
    expect: "look",
  },
  "/data/other-views/#2": {
    // A drag up in the Flickable moves its content, not the page.
    act: async ({ page, at }) => drag(page, await at(0.5, 0.8), await at(0.5, 0.2)),
    expect: "look",
  },
  "/language/controllers/#0": {
    act: tap,
    expect: (text) => /^320 wide, compact/m.test(text),
    // The stage sizes the example's root to its picture, as a sized
    // Loader sizes its item, and keeps it so. Whether an item's own write
    // may take over a size its Loader gave it, ljos-ui's loader.feature
    // does not say yet.
    fails: "the stage keeps the root at the picture's width, so the tap's write to page.width does not hold",
  },
  "/language/controllers/#2": { act: tap, expect: (text) => /^1 taps/m.test(text) },
  "/language/match/#6": { act: tap, expect: (text) => /^Next: \S/m.test(text) },
  // The handler's pipe resolves a promise: 12 doubled, in pixels.
  "/language/pipe/#5": { act: tap, expect: (text) => text.includes("24 px") },
  // A typed TypeScript module's answer, drawn: only("b") is 3.
  "/start/#1": { act: reads, expect: (text) => text.includes('Logic.only("b") is 3') },
  // An .lts module's typed widths, added: 1 and 3.
  "/start/editors/#0": { act: reads, expect: (text) => text.includes("A thin and a thick line are 4 wide") },
  // The files beside an example are what it reads (json/xml group=).
  "/data/models/#5": { act: reads, expect: (text) => text.includes("a1 First") && text.includes("a2 Second") },
  "/data/models/#6": { act: reads, expect: (text) => text.includes("Bread") && text.includes("Honey") },
  // What example.org answers here is the tests' (fixtures.js).
  "/data/tasks/#0": { act: button("Bergen"), expect: (text) => text.includes("Rain in Bergen") },
  "/data/tasks/#1": { act: button("Add a random task"), expect: (text) => text.includes("Walk to the lighthouse") },
  "/data/fetching/#0": { act: reads, expect: (text) => text.includes("Walk to the lighthouse") },
  "/data/fetching/#1": { act: reads, expect: (text) => /^POST \S+\/names$/m.test(text) && text.includes("content-type: application/json") },
  // Aborted as soon as it is made: the file beside it is never read.
  "/data/fetching/#2": { act: reads, expect: (text) => text.includes("stopped") },
  // The chime the site ships (beep.wav), played on a press. #0 is the
  // MediaPlayer's film (media.spec.js).
  "/rust/multimedia/#1": { act: button("Play chime"), expect: (text) => text.includes("Played 1") },
  // fetch of the act.json beside it, read against the page.
  "/rust/threads-and-uihandle/#0": { act: reads, expect: (text) => text.includes("Walk to the lighthouse") },
  "/language/controllers/#1": {
    // The Wheel controller's rotation moves the distance the text shows.
    act: async ({ page, at }) => {
      const { x, y } = await at(0.5, 0.5);
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, 240);
    },
    expect: "text",
  },
};

// Examples that draw nothing, or whose input changes only state they
// never show (a counter nothing draws): pressing them does nothing a
// reader can see. The
// audit's row says "makes no sense"; the suite holds only that they
// run without errors.
export const invisible = new Set([
  "/quality/layout-and-typography/#2", // its one button is disabled until a result is picked
  "/controls/localisation/#1", // its Back and Next have no handler
  "/controls/overview/#1", // a Badge, and buttons with no handler
  "/controls/overview/#2", // its button has no handler: the example is about fonts
  "/quality/accessibility/#3", // the first row is current already, and Delete has no handler
  "/quality/color/#5", // its buttons have no handler: the example is about colour
]);

// Examples whose code reads as moving on its own but that draw nothing
// that moves: a Timer that only counts, an animation that waits on a
// flag nothing sets. They must still run; they need not keep drawing.
export const still = new Set([
  "/language/signals-and-handlers/#4", // the Timer counts ticks nothing draws
  "/ui/offscreen-and-cost/#2", // the spinner runs only while `busy`, which stays false
  "/quality/performance/#0", // the pulse runs only while `syncing`, which stays false
]);

// Examples that move for a while and then come to rest by design: they must
// change once they run, not keep changing. By hash, not by place on the
// page: a block before one that does not run where the site was built (a
// pending one) moves its place.
export const ends = new Map([
  ["3f3c043768509236", "/language/overview/: the Timer counts to 30 in 5 s of the scene's time, then stops"],
]);
