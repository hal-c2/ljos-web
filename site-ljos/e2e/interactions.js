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
// checking it outright. `fixme` names the audit's reason it fails now.
import { drag, pinch, press } from "./fixtures.js";

// A press where a finger lands: the example's own press areas lie over
// its controls, so a click aimed at the element would be refused.
const button = (name) => async ({ stage }) => press(stage.getByRole("button", { name }));

export const interactions = {
  "/start/hot-reload/#0": { act: button("Change label"), expect: "text" },
  "/ui/layouts/#3": { act: button("Second"), expect: "look" },
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
    fixme: "audit: a mouse drag on the box scrolls the page instead (the page Flickable takes mouse drags, as on the Orbit scene); DropArea never says 'entered'",
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
    fixme: "audit: a mouse drag in the example's Flickable scrolls the page Flickable instead; the wheel does reach it",
  },
  "/language/controllers/#1": {
    // The Wheel controller's rotation moves the distance the text shows.
    act: async ({ page, at }) => {
      const { x, y } = await at(0.5, 0.5);
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, 240);
    },
    expect: "text",
    fixme: "audit: a wheel over the Orbit controller example scrolls the page; its Wheel never turns, the text stays 'at 50.0'",
  },
};

// Examples that draw nothing, or whose input changes only state they
// never show (a counter nothing draws): pressing them does nothing a
// reader can see. The
// audit's row says "makes no sense"; the suite holds only that they
// run without errors.
export const invisible = new Set([
  "/language/porting-from-qt/#0",
  "/language/porting-from-qt/#1",
  "/data/pointer-input/#0",
  "/ui/text-input/#1", // read-only: a press selects, and selection is not drawn as state
  "/controls/styles/#2",
  "/controls/localisation/#0",
  "/data/fetching/#2",
  "/language/modules-and-imports/#0",
  "/language/controllers/#0",
  "/language/controllers/#2",
  "/language/match/#6", // a tap sets `action`, which nothing draws
  "/language/pipe/#3", // a tap sets `shown`, which nothing draws
  "/start/#1", // a bare Item: its value is never shown
  "/start/editors/#0", // a bare Item: its value is never shown
]);

// Examples whose code reads as moving on its own but that draw nothing
// that moves: a Timer that only counts, an animation that waits on a
// flag nothing sets. They must still run; they need not keep drawing.
export const still = new Set([
  "/language/signals-and-handlers/#4", // the Timer counts ticks nothing draws
  "/ui/offscreen-and-cost/#2", // the spinner runs only while `busy`, which stays false
]);
