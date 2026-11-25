// LottieAnimation (Qt.labs.lottieqt), as ljos-ui's
// features/lottie/lottie-animation.feature and lottie-painted-item.feature
// say Qt 6.11 has it. A browser reads a file in its own time, so a scene
// waits for its animations to be ready before time is let pass, and what the
// features set in onCompleted, before the file sets the size, is set here
// once the file is read.
import { expect, open, test } from "./open.js";
import { pixels } from "./pixels.js";

const WHITE = "255 255 255";
const BLACK = "0 0 0";
const RED = "255 0 0";
const GREEN = "0 255 0";
const BLUE = "0 0 255";

// Time in a scene stands still; this lets `ms` of it pass.
const advance = (page, ms) => page.evaluate((ms) => window.clock.advance(ms), ms);
const read = (page, compute) => page.evaluate(compute);

// Waits for every animation named to be done loading, whatever it came to.
async function loaded(page, names) {
  await page.waitForFunction((names) => names.every((name) => window.objects[name].status >= 2), names);
}

const finishes = (page) => read(page, () => ({ ...window.scene.finishes }));

test.describe("loading", () => {
  test.use({ told: [/JSON parse error|404|Failed to load resource/] });

  test("without a source the defaults show, with Qt's names", async ({ page }) => {
    await open(page, "lottieload&still");
    expect(await read(page, () => window.scene.defaults)).toBe("0 30 1 true 1 2 0 0 0");
    expect(await read(page, () => window.scene.painted)).toBe("1 #00000000 0 -1 -1 -1 -1");
    expect(await read(page, () => window.scene.names)).toBe("0 1 2 3 1 -1 0 1 2 -1");
    expect(await read(page, () => window.scene.targets)).toBe("0 1 2 1");
  });

  test("a file is announced loading, then ready, and sets the frames, the rate and the size", async ({ page }) => {
    await open(page, "lottieload&still");
    await loaded(page, ["slide", "sized", "paced", "missing", "broken", "nothing"]);
    const seen = await read(page, () => {
      const { slide, sized, paced } = window.objects;
      return {
        states: [...window.scene.slideStates],
        slide: [slide.status, slide.startFrame, slide.endFrame, slide.frameRate, slide.getDuration(true), slide.getDuration(false)],
        sized: [sized.width, sized.height],
        paced: paced.frameRate,
      };
    });
    expect(seen).toEqual({ states: [1, 2], slide: [2, 0, 20, 10, 20, 2], sized: [40, 30], paced: 10 });
  });

  test("a file that is not there, not JSON or not an animation is an error", async ({ page }) => {
    const parse = page.waitForEvent("console", (message) => /JSON parse error/.test(message.text()));
    await open(page, "lottieload&still");
    await loaded(page, ["missing", "broken", "nothing"]);
    await parse;
    const seen = await read(page, () => {
      const { missing, broken, nothing } = window.objects;
      return [[...window.scene.missingStates], broken.status, nothing.status];
    });
    expect(seen).toEqual([[1, 3], 3, 3]);
  });

  test("the first and last frames cannot be set", async ({ page }) => {
    await open(page, "lottieload&still");
    await loaded(page, ["slide"]);
    const said = await read(page, () => window.scene.assignFrames());
    const seen = [said.map((error) => /read-only/.test(error)), await read(page, () => [window.objects.slide.startFrame, window.objects.slide.endFrame])];
    expect(seen).toEqual([[true, true], [0, 20]]);
  });

  test("taking the source away keeps the numbers; another file replaces them", async ({ page }) => {
    await open(page, "lottieload&still");
    await loaded(page, ["slide", "paced"]);
    await read(page, () => {
      window.objects.slide.source = "";
      window.objects.paced.source = "/assets/lottie/blink.json";
    });
    await page.waitForFunction(() => window.objects.paced.endFrame === 10);
    const seen = await read(page, () => {
      const { slide, paced } = window.objects;
      return [slide.status, slide.endFrame, slide.frameRate, paced.status, paced.endFrame, paced.frameRate];
    });
    expect(seen).toEqual([0, 20, 10, 2, 10, 20]);
  });
});

test.describe("playing", () => {
  const all = ["once", "waiting", "fast", "twice", "endless", "reverse", "hidden", "faded"];

  test("a loaded animation plays once across, and says it has finished", async ({ page }) => {
    await open(page, "lottieplay&still");
    await loaded(page, all);
    expect(await pixels(page, [[12, 50]])).toEqual([WHITE]);
    await advance(page, 1000);
    expect(await pixels(page, [[12, 50]])).toEqual([BLACK]);
    await advance(page, 500);
    expect((await finishes(page)).once).toBeUndefined();
    await advance(page, 1000);
    expect(await pixels(page, [[90, 50]])).toEqual([WHITE]);
    await advance(page, 500);
    expect((await finishes(page)).once).toBe(1);
  });

  test("each plays for as long as its rate and loops say", async ({ page }) => {
    await open(page, "lottieplay&still");
    await loaded(page, all);
    await advance(page, 500);
    expect(await finishes(page)).toEqual({});
    await advance(page, 500);
    // Faster at 40 a second; the hidden and the faded one keep time.
    expect(await finishes(page)).toEqual({ fast: 1, hidden: 1, faded: 1 });
    await advance(page, 600);
    expect(await finishes(page)).toEqual({ fast: 1, hidden: 1, faded: 1, twice: 1 });
    await advance(page, 1400);
    expect(await finishes(page)).toEqual({ fast: 1, hidden: 1, faded: 1, twice: 1, once: 1 });
    // The one waiting to be started is still on its first frame.
    expect(await pixels(page, [[112, 50]])).toEqual([WHITE]);
  });

  test("played in reverse it starts on the last frame", async ({ page }) => {
    await open(page, "lottieplay&still");
    await loaded(page, all);
    await advance(page, 100);
    expect(await pixels(page, [[112, 150]])).toEqual([WHITE]);
    await read(page, () => window.objects.reverse.start());
    await advance(page, 150);
    expect(await pixels(page, [[186, 150], [112, 150]])).toEqual([WHITE, BLACK]);
    await advance(page, 2500);
    expect(await pixels(page, [[112, 150]])).toEqual([WHITE]);
  });

  test("a change of the loops is announced once, and the quality can be chosen", async ({ page }) => {
    await open(page, "lottieplay&still");
    const seen = await read(page, () => {
      const { once } = window.objects;
      let changes = 0;
      once.loopsChanged.connect(() => changes++);
      once.loops = 3;
      once.loops = 3;
      once.quality = 0;
      return [changes, once.quality];
    });
    expect(seen).toEqual([1, 0]);
  });
});

test.describe("steering", () => {
  const all = ["paused", "toggled", "stopped", "held", "past", "played", "marked"];

  test("pausing holds it, and playing goes on from there", async ({ page }) => {
    await open(page, "lottiesteer&still");
    await loaded(page, all);
    await read(page, () => {
      window.objects.paused.pause();
      window.objects.toggled.togglePause();
    });
    await advance(page, 1000);
    expect(await finishes(page)).toEqual({});
    await read(page, () => {
      window.objects.paused.play();
      window.objects.toggled.togglePause();
    });
    await advance(page, 1000);
    expect(await finishes(page)).toEqual({ paused: 1, toggled: 1 });
  });

  test("stopping goes back to the first frame without finishing", async ({ page }) => {
    await open(page, "lottiesteer&still");
    await loaded(page, all);
    await advance(page, 1000);
    await read(page, () => window.objects.stopped.stop());
    await advance(page, 2500);
    expect((await finishes(page)).stopped).toBeUndefined();
    expect(await pixels(page, [[212, 50]])).toEqual([WHITE]);
  });

  test("going to a frame stops there, past the end is the last, and playing goes on", async ({ page }) => {
    await open(page, "lottiesteer&still");
    await loaded(page, all);
    await read(page, () => {
      window.objects.held.gotoAndStop(10);
      window.objects.past.gotoAndStop(100);
      window.objects.played.gotoAndPlay(15);
    });
    await advance(page, 500);
    expect(await pixels(page, [[350, 50], [312, 50], [90, 150]])).toEqual([WHITE, BLACK, WHITE]);
    await advance(page, 500);
    expect((await finishes(page)).played).toBe(1);
  });

  test("going to a marker by its name", async ({ page }) => {
    await open(page, "lottiesteer&still");
    await loaded(page, all);
    await read(page, () => window.scene.jump());
    expect(await read(page, () => [...window.scene.found])).toEqual([false, true]);
    expect(await pixels(page, [[230, 150], [212, 150]])).toEqual([WHITE, BLACK]);
  });
});

// Ljós promises that an animation at rest asks the clock for nothing.
test("an animation at rest has nothing scheduled", async ({ page }) => {
  const jobs = () => read(page, () => globalThis[Symbol.for("ljos-web/clock")].jobs);
  await open(page, "lottierest&still");
  await loaded(page, ["ends", "pausing", "waits", "unseen"]);
  await advance(page, 300);
  await read(page, () => window.objects.pausing.pause());
  await advance(page, 700);
  expect(await jobs()).toBe(0);
});

test.describe("painting", () => {
  test("each property says when it changes", async ({ page }) => {
    await open(page, "lottiepainted&still");
    await read(page, () => window.scene.change());
    const seen = await read(page, () => [...window.scene.changes]);
    expect(seen).toEqual(["scale", "fill", "contents", "texture", "target"]);
  });

  test("the file is painted at its own size from the top left, cut at the item", async ({ page }) => {
    await open(page, "lottiepainted&still");
    await loaded(page, ["unstretched", "fitted", "doubled", "filled", "wide", "textured", "nought", "translucent"]);
    const at = {
      unstretched: [[10, 10], [30, 10], [10, 30]],
      fitted: [[170, 30], [230, 30], [200, 70]],
      doubled: [[310, 10], [290, 30]],
      filled: [[10, 110], [60, 140], [90, 110], [10, 170]],
      wide: [[195, 155], [205, 110]],
      textured: [[230, 110], [250, 110], [270, 110], [230, 130]],
      nought: [[10, 210], [30, 210]],
      translucent: [[310, 210]],
    };
    const names = Object.keys(at);
    const got = await pixels(page, names.flatMap((name) => at[name]));
    const seen = Object.fromEntries(names.map((name) => [name, got.splice(0, at[name].length)]));
    expect(seen).toEqual({
      unstretched: [RED, BLACK, BLACK],
      fitted: [RED, GREEN, BLACK],
      doubled: [RED, BLACK],
      filled: [RED, BLUE, BLACK, BLACK],
      wide: [BLUE, BLACK],
      textured: [RED, BLUE, BLACK, BLACK],
      nought: [BLACK, BLACK],
      translucent: [RED],
    });
    // Half the blue over white.
    const [r, g, b] = (await pixels(page, [[330, 210]]))[0].split(" ").map(Number);
    expect([r, g, b].map((v, i) => Math.abs(v - [127, 127, 255][i]) <= 3)).toEqual([true, true, true]);
  });
});

// HAL-C2's avatars, drawn by Blender's grease pencil and exported as
// Lottie: each frame as its preview (ljos-ui features/lottie/avatars,
// `dance-07.png`, `genie-17.png`) has it, within what antialiasing moves.
test("the HAL-C2 avatars are drawn as their previews show them", async ({ page }) => {
  await open(page, "lottieavatar&still");
  await loaded(page, ["dance", "genie"]);
  const near = (seen, want) => seen.every((rgb, index) => rgb.split(" ").every((channel, at) => Math.abs(Number(channel) - want[index][at]) <= 3));
  await read(page, () => window.objects.dance.gotoAndStop(7));
  const dance = await pixels(page, [[160, 170], [140, 90], [245, 97], [200, 230], [30, 30]]);
  expect(near(dance, [[0, 0, 5], [249, 168, 25], [117, 142, 249], [246, 244, 244], [255, 255, 255]]), dance.join(", ")).toBe(true);
  await read(page, () => {
    window.objects.dance.visible = false;
    window.objects.genie.visible = true;
    window.objects.genie.gotoAndStop(17);
  });
  const genie = await pixels(page, [[150, 140], [110, 65], [200, 62], [105, 205], [290, 290]]);
  expect(near(genie, [[0, 0, 5], [249, 168, 25], [117, 142, 249], [249, 168, 25], [255, 255, 255]]), genie.join(", ")).toBe(true);
});

test("an animation that has finished does not finish again when played", async ({ page }) => {
  await open(page, "lottieplay&still");
  await loaded(page, ["once"]);
  await advance(page, 3000);
  expect((await finishes(page)).once).toBe(1);
  await read(page, () => window.objects.once.play());
  await advance(page, 3000);
  expect((await finishes(page)).once).toBe(1);
  await read(page, () => window.objects.once.start());
  await advance(page, 3000);
  expect((await finishes(page)).once).toBe(2);
});

// What a file says, read and drawn by the renderer itself, as the Lottie
// format (lottie-spec) has it: one shape layer, 100 by 100, at frame `t`.
test.describe("the format", () => {
  const modules = async (page) => {
    await open(page, "lottieplay&still");
    await loaded(page, ["once"]);
    return page.evaluateHandle(async () => {
      const find = (re) => performance.getEntriesByType("resource").find(({ name }) => re.test(name)).name;
      return { model: await import(find(/lottieqt\/model\.js(\?|$)/)), render: await import(find(/lottieqt\/render\.js(\?|$)/)) };
    });
  };
  // Draws `shapes` at frame `t`, with the warnings parse gave.
  const draw = (page, lib, shapes, t = 0) =>
    page.evaluate(
      ({ lib, shapes, t }) => {
        const file = { w: 100, h: 100, fr: 10, ip: 0, op: 10, layers: [{ ty: 4, ip: 0, op: 10, ks: {}, shapes }] };
        const comp = lib.model.parse(JSON.stringify(file));
        return { drawn: lib.render.render(comp, t), warnings: comp.warnings };
      },
      { lib, shapes, t },
    );
  const fill = { ty: "fl", c: { k: [1, 0, 0, 1] }, o: { k: 100 } };

  test("a segment eases by the out and in tangents of the key it starts from", async ({ page }) => {
    const lib = await modules(page);
    const at = await page.evaluate((lib) => {
      const p = lib.model.prop({ a: 1, k: [{ t: 0, s: [0], o: { x: [0], y: [0] }, i: { x: [1], y: [1] } }, { t: 10, s: [10], i: { x: [0], y: [1] } }] });
      return p.num(5, 0, 0);
    }, lib);
    expect(Math.abs(at - 5)).toBeLessThan(0.01);
  });

  test("a shape of a type that is no string is warned about, not thrown on", async ({ page }) => {
    const lib = await modules(page);
    const { warnings } = await draw(page, lib, [{ ty: { toString: 1 } }]);
    expect(warnings).toEqual(['shapes of type "" are not drawn']);
  });

  test("an ellipse starts at its top", async ({ page }) => {
    const lib = await modules(page);
    const { drawn } = await draw(page, lib, [{ ty: "el", p: { k: [50, 50] }, s: { k: [40, 20] } }, fill]);
    expect(drawn[0].path[0]).toEqual(["M", 50, 40]);
  });

  test("a trim past either end is held at that end", async ({ page }) => {
    const lib = await modules(page);
    const line = { ty: "sh", ks: { k: { c: false, v: [[0, 50], [100, 50]], i: [[0, 0], [0, 0]], o: [[0, 0], [0, 0]] } } };
    const stroke = { ty: "st", c: { k: [0, 0, 0, 1] }, o: { k: 100 }, w: { k: 2 } };
    const whole = await draw(page, lib, [line, { ty: "tm", s: { k: 0 }, e: { k: 50 }, o: { k: 0 } }, stroke]);
    const past = await draw(page, lib, [line, { ty: "tm", s: { k: -50 }, e: { k: 50 }, o: { k: 0 } }, stroke]);
    expect(past.drawn[0].path).toEqual(whole.drawn[0].path);
  });

  test("a star asks for no more points than it can show", async ({ page }) => {
    const lib = await modules(page);
    const star = { ty: "sr", sy: 1, p: { k: [50, 50] }, pt: { k: 1e9 }, or: { k: 40 }, ir: { k: 20 }, r: { k: 0 }, os: { k: 0 }, is: { k: 0 } };
    const { drawn } = await draw(page, lib, [star, fill]);
    expect(drawn[0].path.length).toBeLessThanOrEqual(2002);
  });

  test("an opacity stop between colour stops is kept", async ({ page }) => {
    const lib = await modules(page);
    const gradient = { ty: "gf", t: 1, s: { k: [0, 0] }, e: { k: [100, 0] }, o: { k: 100 }, g: { p: 2, k: { k: [0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0.5, 0, 1, 1] } } };
    const { drawn } = await draw(page, lib, [{ ty: "rc", p: { k: [50, 50] }, s: { k: [100, 100] }, r: { k: 0 } }, gradient]);
    const { stops } = drawn[0].gradient;
    expect(stops.map((s) => [s.offset, Math.round(s.color[0] * 100) / 100, s.color[3]])).toEqual([
      [0, 1, 1],
      [0.5, 0.5, 0],
      [1, 0, 1],
    ]);
  });

  test("two colour stops at one offset keep their hard edge", async ({ page }) => {
    const lib = await modules(page);
    const gradient = { ty: "gf", t: 1, s: { k: [0, 0] }, e: { k: [100, 0] }, o: { k: 100 }, g: { p: 4, k: { k: [0, 1, 0, 0, 0.5, 1, 0, 0, 0.5, 0, 0, 1, 1, 0, 0, 1] } } };
    const { drawn } = await draw(page, lib, [{ ty: "rc", p: { k: [50, 50] }, s: { k: [100, 100] }, r: { k: 0 } }, gradient]);
    expect(drawn[0].gradient.stops.map((s) => [s.offset, s.color[0], s.color[2]])).toEqual([
      [0, 1, 0],
      [0.5, 1, 0],
      [0.5, 0, 1],
      [1, 0, 1],
    ]);
  });

  test("precompositions used over and over draw no more than a frame can", async ({ page }) => {
    const lib = await modules(page);
    const count = await page.evaluate((lib) => {
      const ref = (id) => ({ ty: 0, refId: id, ip: 0, op: 10, ks: {}, w: 100, h: 100 });
      const assets = [{ id: "a0", layers: [{ ty: 1, sc: "#ff0000", sw: 1, sh: 1, ip: 0, op: 10, ks: {} }] }];
      for (let i = 1; i <= 12; i++) assets.push({ id: `a${i}`, layers: Array.from({ length: 10 }, () => ref(`a${i - 1}`)) });
      const file = { w: 100, h: 100, fr: 10, ip: 0, op: 10, assets, layers: [ref("a12")] };
      return lib.render.render(lib.model.parse(JSON.stringify(file)), 0).length;
    }, lib);
    expect(count).toBeLessThanOrEqual(10_000);
    expect(count).toBeGreaterThan(0);
  });
});
