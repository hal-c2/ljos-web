// What plays on its own: every live example with a Video, a MediaPlayer
// or a VideoOutput plays once run, and every one that moves on its own
// (an animation, a timer, a shader, 3D) keeps drawing frames. The
// docs' rust/multimedia page shows a film (SITE-4 part 7b); were no page
// to show one, the video test would stand as a fixme until one did.
import { centre, classify, expectFramesAdvance, expectVideoPlays, livePages, open, run, test, unexpected, expect } from "./fixtures.js";
import { brokenExample } from "./known.js";

const live = livePages().flatMap(({ route, examples }) => examples.map((example) => ({ route, ...example, kind: classify(example.code) })));
const videos = live.filter((example) => example.kind.video);

test.describe("video", () => {
  test.skip(({ wasm }) => !wasm, "a block runs only with WebAssembly");

  if (videos.length === 0) {
    test("a docs page shows a video, and it plays", () => {
      test.fixme(true, "part 7b: no docs page shows a Video or MediaPlayer + VideoOutput");
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
      // A picture is known by the pixels it decodes to at its own size,
      // not by its bytes (a VectorImage draws its SVG re-serialised), so
      // one drawn from elsewhere never stands in for the example's own.
      const undrawn = () =>
        block.running.evaluate(
          async (root, wanted) => {
            const look = async (address) => {
              const image = new Image();
              image.src = address;
              if (!(await image.decode().then(() => image.naturalWidth > 0, () => false))) return null;
              const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
              const context = canvas.getContext("2d");
              context.drawImage(image, 0, 0);
              // A picture from another origin cannot be read back; it is
              // none of the example's own, so it is passed over.
              let pixels;
              try {
                pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
              } catch {
                return null;
              }
              const digest = await crypto.subtle.digest("SHA-256", pixels);
              return `${canvas.width}x${canvas.height}:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
            };
            const addresses = new Set();
            for (const element of [root, ...root.querySelectorAll("*")]) {
              if (element instanceof HTMLImageElement && element.src) addresses.add(element.src);
              for (const [, address] of getComputedStyle(element).backgroundImage.matchAll(/url\("?([^")]+)"?\)/g)) addresses.add(address);
            }
            const seen = new Set(await Promise.all([...addresses].map(look)));
            const missing = [];
            for (const [name, { packed, type }] of Object.entries(wanted)) {
              const file = new Blob([Uint8Array.from(atob(packed), (c) => c.charCodeAt(0))], { type });
              const address = URL.createObjectURL(file);
              const own = await look(address);
              URL.revokeObjectURL(address);
              if (!own || !seen.has(own)) missing.push(name);
            }
            return missing;
          },
          Object.fromEntries(
            pictures.map((name) => [name, { packed: example.packed[name], type: /\.svg$/.test(name) ? "image/svg+xml" : "" }]),
          ),
        );
      await expect.poll(undrawn, { message: `${pictures.join(" and ")} decoded` }).toEqual([]);
      expect(unexpected(errors)).toEqual([]);
    });
  }
});
