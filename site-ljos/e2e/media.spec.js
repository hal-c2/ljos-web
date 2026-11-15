// What plays on its own: every live example with a Video, a MediaPlayer
// or a VideoOutput plays once run, and every one that moves on its own
// (an animation, a timer, a shader, 3D) keeps drawing frames. The docs
// show no video yet (SITE-4 part 7b), so the video test stands as a
// fixme until a page shows one; it then holds the first.
import { centre, classify, expectFramesAdvance, expectVideoPlays, livePages, open, run, test, unexpected, expect } from "./fixtures.js";
import { brokenExample } from "./known.js";

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
      const broken = brokenExample(example.route, example.index);
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
      const broken = brokenExample(example.route, example.index);
      test.fail(Boolean(broken), broken ?? "");
      await open(page, example.route);
      const block = await run(page, example.index);
      const canvas = block.running.locator("canvas").first();
      await expect(canvas, "the example draws into a canvas").toBeAttached();
      if (example.kind.moves) await expectFramesAdvance(canvas);
      else {
        // It drew something: its place looks different with the canvas
        // hidden. A canvas with a size but nothing drawn looks the same.
        await centre(canvas);
        const clip = await canvas.boundingBox();
        const drawn = await page.screenshot({ clip });
        await canvas.evaluate((element) => (element.style.visibility = "hidden"));
        const without = await page.screenshot({ clip });
        await canvas.evaluate((element) => (element.style.visibility = ""));
        expect(Buffer.compare(drawn, without) !== 0, "the canvas holds a picture").toBe(true);
      }
      expect(unexpected(errors)).toEqual([]);
    });
  }
});

// An example that names a picture the site ships (files=) draws it: the
// picture arrives, decoded, where a missing one would leave its place
// empty and say nothing.
test.describe("an example's own pictures are drawn", () => {
  test.skip(({ wasm }) => !wasm, "a block runs only with WebAssembly");

  for (const example of live.filter(({ given }) => given.some((name) => /\.(png|jpe?g|gif|webp|avif|svg)$/.test(name)))) {
    test(`${example.route}#${example.index} draws ${example.given.join(", ")}`, async ({ page, errors }) => {
      // What the audit found broken in an example (known.js) is never its
      // pictures: they are held drawn whatever else it does.
      await open(page, example.route);
      const block = await run(page, example.index);
      const pictures = example.given.filter((name) => /\.(png|jpe?g|gif|webp|avif|svg)$/.test(name));
      // An Image draws as an element's background, so each address the
      // example draws from, an img's or a background's, is decoded anew.
      const decoded = () =>
        block.running.evaluate(async (root) => {
          const addresses = new Set();
          for (const element of [root, ...root.querySelectorAll("*")]) {
            if (element instanceof HTMLImageElement && element.src) addresses.add(element.src);
            for (const [, address] of getComputedStyle(element).backgroundImage.matchAll(/url\("?([^")]+)"?\)/g)) addresses.add(address);
          }
          const shown = await Promise.all(
            [...addresses].map((address) => {
              const image = new Image();
              image.src = address;
              return image.decode().then(() => image.naturalWidth > 0, () => false);
            }),
          );
          return shown.filter(Boolean).length;
        });
      await expect.poll(decoded, { message: `${pictures.join(" and ")} decoded` }).toBeGreaterThanOrEqual(pictures.length);
      expect(unexpected(errors)).toEqual([]);
    });
  }
});
