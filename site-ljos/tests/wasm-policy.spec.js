// A page policy that refuses WebAssembly leaves WebAssembly named, and a
// demo that needs it unable to run: its frame keeps the picture and says
// so, as where there is no WebAssembly. A demo that needs only WebGL 2
// still runs, on the JavaScript renderer, and so do the field guide and
// Motion, which compile none. See docs/LJOS_WEB.md.
//
// The policy is `script-src 'self'` and, by their hashes, the page's own
// inline scripts, without which no page of the site starts. Nothing in it
// lets WebAssembly or eval by.
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

test.use({ launchOptions: { args: ["--disable-features=WebGPU", "--enable-unsafe-swiftshader"] }, reducedMotion: "no-preference" });

const INLINE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
const NOTE = "A picture of the demo: it runs in a browser with WebAssembly, which this one does not offer.";

async function opened(page, path) {
  let policed = 0;
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") return route.fallback();
    const response = await route.fetch();
    const body = await response.text();
    const own = [...body.matchAll(INLINE)].map(([, script]) => ` 'sha256-${createHash("sha256").update(script).digest("base64")}'`);
    policed++;
    await route.fulfill({ response, body, headers: { ...response.headers(), "content-security-policy": `script-src 'self'${own.join("")}` } });
  });
  await page.goto(path);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  expect(policed, "the page came with the policy").toBeGreaterThan(0);
}

for (const [path, stopped, running] of [
  ["/demos/cockpit/", ["the cockpit"], []],
  ["/demos/", [], ["the field guide", "the motion demo", "the 3D demo", "the shader demo"]],
]) {
  test(`${path} under a policy that refuses WebAssembly keeps the picture and says why, where it needs it`, async ({ page }) => {
    await opened(page, path);
    const notes = page.getByText(NOTE, { exact: true }).filter({ visible: true });
    await expect(notes).toHaveCount(stopped.length);
    for (const what of stopped) await expect(page.getByRole("button", { name: `Run ${what}`, exact: true }), what).toHaveCount(0);
    for (const what of running) await expect(page.getByRole("button", { name: `Run ${what}`, exact: true }), what).toHaveCount(1);
    for (let at = 0; at < stopped.length; at++) {
      const pictured = await notes.nth(at).evaluate((text) => {
        let frame = text;
        while (!frame.querySelector("img")) frame = frame.parentElement;
        return [...frame.querySelectorAll("img")].some((img) => img.checkVisibility());
      });
      expect(pictured, `${stopped[at]}'s picture`).toBe(true);
    }
  });
}

for (const [what, words] of [
  ["the field guide", "Field guide"],
  ["the motion demo", "Drag the ring · three springs chase it"],
]) {
  test(`under such a policy ${what} starts when its Run is pressed`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.stack || error.message));
    await opened(page, "/demos/");
    const inside = page.getByText(words, { exact: true }).filter({ visible: true });
    await expect(inside, "before it runs").toHaveCount(0);
    await page.getByRole("button", { name: `Run ${what}`, exact: true }).click();
    await expect(inside.first(), "what it draws").toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: `Pause ${what}`, exact: true })).toHaveCount(1);
    const compiles = await page.evaluate(
      () =>
        new Promise((done) =>
          setTimeout(() => {
            try {
              new WebAssembly.Module(new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]));
              done(true);
            } catch {
              done(false);
            }
          }),
        ),
    );
    expect(compiles, "the policy was in force").toBe(false);
    expect(errors).toEqual([]);
  });
}

// The pro demos' pages are one page, whose frame is given the other demo.
test("under such a policy a frame that goes from one demo to the other says what is so of each", async ({ page }) => {
  await opened(page, "/demos/watch/");
  const run = (demo) => page.getByRole("button", { name: `Run the ${demo}`, exact: true });
  const note = page.getByText(NOTE, { exact: true }).filter({ visible: true });
  await expect(run("watch")).toHaveCount(1);
  for (const demo of ["cockpit", "watch", "cockpit"]) {
    await page.evaluate((demo) => {
      history.pushState({}, "", `/demos/${demo}/`);
      dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    }, demo);
    await expect(run(demo === "cockpit" ? "watch" : "cockpit")).toHaveCount(0);
    await expect(note).toHaveCount(demo === "cockpit" ? 1 : 0);
    await expect(run(demo)).toHaveCount(demo === "cockpit" ? 0 : 1);
  }
});

test("the watch under such a policy runs on the JavaScript renderer, and moves", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  const fetched = [];
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  page.on("request", (request) => /ljos_web_3d_bg[^/?]*\.wasm(\?|$)/.test(request.url()) && fetched.push(request.url()));
  await opened(page, "/demos/watch/");
  await page.getByRole("button", { name: "Run the watch", exact: true }).click();
  const byScript = () =>
    page.locator(".qq-view3d").evaluateAll((all) => all.length > 0 && all.every(({ $view3d }) => $view3d?.renderer === "js" && $view3d.frames > 0));
  await expect.poll(byScript, { timeout: 60_000 }).toBe(true);
  const canvas = page.locator(".qq-view3d").filter({ visible: true }).first();
  const frames = () => canvas.evaluate(({ $view3d }) => $view3d.frames);
  for (let later = 0; later < 2; later++) {
    const drawn = await frames();
    const before = await canvas.screenshot();
    await expect.poll(async () => (await canvas.screenshot()).equals(before), { timeout: 30_000 }).toBe(false);
    // What lies over the canvas is in its picture too.
    await expect.poll(frames, { message: "the view's own frames", timeout: 30_000 }).toBeGreaterThan(drawn);
  }
  expect(await byScript()).toBe(true);
  expect(fetched, "the wgpu renderer's wasm").toEqual([]);
  expect(errors).toEqual([]);
});
