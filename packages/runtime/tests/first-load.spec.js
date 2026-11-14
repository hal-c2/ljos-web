// What a built page loads first, read from the build as ljos.dev's own
// check reads it (`size/pages.js`). A build for the JavaScript renderer
// names the wasm of the wgpu one in no file a page loads before it runs,
// however soon an application's View3D comes, and still draws on wgpu
// when its page says so; a build for wgpu has the address at once, so
// the fetch starts as the first document that draws in space is made.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { build, defaultClientConditions, preview } from "vite";
import { pageReport } from "../size/pages.js";
import qml, { kernelConditions } from "../vite.js";

const WASM = /ljos_web_3d_bg[^/?]*\.wasm$/;
const renderer = (files) => files.map(({ file }) => file).filter((file) => WASM.test(file));
const root = join(import.meta.dirname, "first-load");

// The application built for `view3d` (or for the JavaScript renderer),
// handed to `use` while it is there.
async function built(view3d, use) {
  const out = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-first-load-"));
  // What the build is for, as a build is told it: the QML plugin and the
  // page read it alike.
  const before = process.env.VITE_LJOS_VIEW3D;
  if (view3d) process.env.VITE_LJOS_VIEW3D = view3d;
  else delete process.env.VITE_LJOS_VIEW3D;
  try {
    // Built as ljos.dev is (`site.js`): its assets named from where the page is.
    await build({
      configFile: false,
      root,
      base: "./",
      logLevel: "warn",
      plugins: [qml({ qmlc: process.env.QMLC ?? join(import.meta.dirname, "../../../target/debug/qmlc"), styles: "ljos", qt: [] })],
      resolve: { dedupe: ["solid-js", "@solidjs/web", "@solidjs/signals"], conditions: [...kernelConditions(), ...defaultClientConditions] },
      build: { outDir: out, emptyOutDir: true, target: "esnext" },
    });
    return await use(out);
  } finally {
    if (before === undefined) delete process.env.VITE_LJOS_VIEW3D;
    else process.env.VITE_LJOS_VIEW3D = before;
    rmSync(out, { recursive: true, force: true });
  }
}

function reported(out) {
  const [page, ...others] = pageReport(out);
  expect(others).toEqual([]);
  return page;
}

test("an application built for the JavaScript renderer, with a View3D in its first load, has the wgpu renderer's wasm only in what it may fetch later", async () => {
  test.setTimeout(180_000);
  const page = await built(undefined, reported);
  expect(renderer(page.first.files)).toEqual([]);
  expect(renderer(page.later.files), "the renderer, for a page that says wgpu").toHaveLength(1);
});

test("an application built for the JavaScript renderer draws on wgpu when its page says so, and fetches the renderer once", async ({ page }) => {
  test.setTimeout(180_000);
  await built(undefined, async (out) => {
    const server = await preview({ configFile: false, root, logLevel: "warn", build: { outDir: out }, preview: { host: "127.0.0.1", port: 0 } });
    try {
      const fetched = [];
      page.on("request", (request) => fetched.push(request.url()));
      await page.goto(`${server.resolvedUrls.local[0]}?view3d=wgpu`);
      await page.waitForFunction(() => {
        const state = document.querySelector(".qq-view3d")?.$view3d;
        if (state?.error) throw new Error(state.error);
        return state?.frames > 0;
      });
      expect(fetched.filter((url) => WASM.test(url))).toHaveLength(1);
    } finally {
      await server.close();
    }
  });
});

test("an application built for wgpu, with a View3D in its first load, has the renderer's address at once", async () => {
  test.setTimeout(180_000);
  const page = await built("wgpu", reported);
  expect(renderer(page.first.files)).toHaveLength(1);
});
