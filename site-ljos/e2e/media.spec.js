// What plays on its own: every live example with a Video, a MediaPlayer
// or a VideoOutput plays once run, and every one that moves on its own
// (an animation, a timer, a shader, 3D) keeps drawing frames. The docs
// show no video yet (SITE-4 part 7b), so the video test stands as a
// fixme until a page shows one; it then holds the first.
import { classify, expectFramesAdvance, expectVideoPlays, livePages, open, run, test, unexpected, expect } from "./fixtures.js";
import { brokenExample, windowRoot } from "./known.js";

const live = livePages().flatMap(({ route, examples }) => examples.map((example) => ({ route, ...example, kind: classify(example.code) })));
const videos = live.filter((example) => example.kind.video);

test.describe("video", () => {
  test.skip(({ wasm }) => !wasm, "a block runs only with WebAssembly");

  if (videos.length === 0) {
    test("a docs page shows a video, and it plays", () => {
      test.fixme(true, "part 7b: no docs page shows a Video or MediaPlayer + VideoOutput yet; prerendering one throws (audit H c: MediaPlayer.js's server element has no play/pause)");
    });
  }

  for (const example of videos) {
    test(`${example.route}#${example.index} plays its video`, async ({ page, errors }) => {
      const broken = brokenExample(example.route, example.index) ?? (example.kind.window ? windowRoot : null);
      test.fail(Boolean(broken), broken ?? "");
      await open(page, example.route);
      const block = await run(page, example.index);
      await expectVideoPlays(block.running);
      expect(unexpected(errors)).toEqual([]);
    });
  }
});

test.describe("canvas, shader and Canvas items keep drawing", () => {
  test.skip(({ wasm }) => !wasm, "a block runs only with WebAssembly");

  for (const example of live.filter((example) => /\b(ShaderEffect|Canvas|ParticleSystem)\s*\{/.test(example.code))) {
    test(`${example.route}#${example.index} draws into its canvas`, async ({ page, errors }) => {
      const broken = brokenExample(example.route, example.index) ?? (example.kind.window ? windowRoot : null);
      test.fail(Boolean(broken), broken ?? "");
      await open(page, example.route);
      const block = await run(page, example.index);
      const canvas = block.running.locator("canvas").first();
      await expect(canvas, "the example draws into a canvas").toBeAttached();
      if (example.kind.moves) await expectFramesAdvance(canvas);
      else expect(await canvas.evaluate((element) => element.width * element.height), "the canvas has pixels").toBeGreaterThan(0);
      expect(unexpected(errors)).toEqual([]);
    });
  }
});
