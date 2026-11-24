import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, delimiter, dirname, join, relative, resolve } from "node:path";
import { build } from "vite";
import { buildSite, builtWith, mendOf, replaceSite, STAMP } from "../site.js";
import qml from "../vite.js";
import { bundle, compilerFile, design, qmlc } from "./bundle.js";
import { runnable } from "./compiler-check.js";
import { expect, part, serve, shared, test } from "./served.js";

// Below a path of its own, as a site is put on a host among others.
const below = "/somewhere/site/";
test.describe("a site built from a bundle", () => {
  test.describe.configure({ mode: "serial" });
  let made;
  let built;
  let server;

  test.beforeAll(shared("build the site and serve it", async () => {
    made = bundle("project");
    built = await part("build the site", () => buildSite({ dir: made.dir, out: made.out, qmlc, with: [design] }));
    server = await part("serve it", () => serve(made.out, { below }));
  }));
  test.afterAll(shared("stop serving it and remove the bundle", async () => {
    await part("stop serving it", () => server?.stop());
    made?.remove();
  }));

  test("shows the entry's text in the colour its design module gives text, and its picture", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    await page.goto(`${server.origin}${below}`);
    const text = page.getByText("Stopped", { exact: true });
    await expect(text).toBeVisible();
    expect(await text.evaluate((element) => getComputedStyle(element).color)).toBe("rgb(18, 52, 86)");
    // An Image paints its picture as the background of its face.
    await page.waitForFunction(() => [...document.querySelectorAll("#app *")].some((element) => getComputedStyle(element).backgroundImage.startsWith("url(")));
    const picture = await page.evaluate(async () => {
      const element = [...document.querySelectorAll("#app *")].find((element) => getComputedStyle(element).backgroundImage.startsWith("url("));
      const { width, height } = element.getBoundingClientRect();
      const image = new Image();
      image.src = getComputedStyle(element).backgroundImage.slice(5, -2);
      await image.decode();
      return [width, height, image.naturalWidth, image.naturalHeight];
    });
    expect(picture).toEqual([8, 8, 8, 8]);
    expect(errors).toEqual([]);
  });

  test("is static files of its own, asked for below the path it is served at", async ({ page }) => {
    const asked = [];
    page.on("request", (request) => asked.push(request.url()));
    await page.goto(`${server.origin}${below}`);
    await expect(page.getByText("Stopped", { exact: true })).toBeVisible();
    expect(asked.length).toBeGreaterThan(0);
    for (const url of asked) expect(url.startsWith(`${server.origin}${below}`) || url.startsWith("data:")).toBe(true);
    expect(built.files).toContain("index.html");
    expect(built.bytes).toBeGreaterThan(0);
  });

  // Modules run in order across files only while no file imports one
  // that imports it back; a small site's runtime is all in its first
  // load, so that is where a cycle would be (packages/runtime/site.js).
  test("is files none of which imports one that imports it back", () => {
    const scripts = readdirSync(made.out, { recursive: true }).filter((file) => file.endsWith(".js")).map((file) => join(made.out, file));
    expect(scripts.length).toBeGreaterThan(0);
    const imports = (file) => [...readFileSync(file, "utf8").matchAll(/(?:\bimport|\bfrom)\s*["'](\.{1,2}\/[^"']+\.js)["']/g)].map(([, spec]) => join(dirname(file), spec));
    const back = {};
    for (const script of scripts) {
      const seen = new Set();
      const stack = imports(script);
      while (stack.length) {
        const file = stack.pop();
        if (seen.has(file)) continue;
        seen.add(file);
        const next = existsSync(file) ? imports(file) : [];
        if (next.includes(script)) (back[relative(made.out, script)] ??= []).push(relative(made.out, file));
        stack.push(...next);
      }
    }
    expect(back, "files that import the file they are imported by").toEqual({});
  });

  test("carries the bundle's theme as it is, and says it built the site", () => {
    expect(readFileSync(join(made.out, "theme.json"), "utf8")).toBe(readFileSync(join(made.dir, "theme.json"), "utf8"));
    expect(readFileSync(join(made.out, STAMP), "utf8").trim()).toMatch(/^[0-9a-f]{40}$/);
  });
});

// A client build's files as rolldown gives them, with only what is read
// of them: what the order they run in turns on is too rare a cut to
// make a site for each.
const chunk = (fileName, { isEntry = false, imports = [], moduleIds = [`/${fileName.replace(/-.*/, "")}.ts`] } = {}) => ({ type: "chunk", fileName, name: fileName.replace(/-.*/, ""), isEntry, imports, moduleIds, facadeModuleId: isEntry ? moduleIds[0] : null });
const files = (...chunks) => [{ output: [...chunks, { type: "asset", fileName: "site-a.css" }] }];

test.describe("a build's files that import `site-*` back", () => {
  test("are none: the build is kept as it was made", () => {
    expect(mendOf(files(
      chunk("index-a.js", { isEntry: true, imports: ["site-b.js", "page-c.js"], moduleIds: ["/entry.js"] }),
      chunk("site-b.js"),
      chunk("page-c.js", { imports: ["site-b.js"] }),
    ))).toEqual([]);
  });

  test("are the entry's: what tree shaking left there beside the entry is given back, to be moved into `site-*`", () => {
    expect(mendOf(files(
      chunk("index-a.js", { isEntry: true, imports: ["site-b.js"], moduleIds: ["/entry.js", "/drawn.ts", "/scene.ts"] }),
      chunk("site-b.js", { imports: ["index-a.js"] }),
    ))).toEqual(["/drawn.ts", "/scene.ts"]);
  });

  test("are another's, however far down: the build fails and names it", () => {
    const made = files(
      chunk("index-a.js", { isEntry: true, imports: ["site-b.js"], moduleIds: ["/entry.js"] }),
      chunk("site-b.js", { imports: ["runtime-c.js"] }),
      chunk("runtime-c.js", { imports: ["shared-d.js"] }),
      chunk("shared-d.js", { imports: ["site-b.js"] }),
    );
    expect(() => mendOf(made)).toThrow("the site's files import `site-*` back through shared-d.js (/shared.ts)");
  });

  test("are the entry's and another's: the build fails and names both, as the entry's alone would not mend it", () => {
    const made = files(
      chunk("index-a.js", { isEntry: true, imports: ["site-b.js"], moduleIds: ["/entry.js", "/drawn.ts"] }),
      chunk("site-b.js", { imports: ["index-a.js", "runtime-c.js"] }),
      chunk("runtime-c.js", { imports: ["site-b.js"] }),
    );
    expect(() => mendOf(made)).toThrow("index-a.js (/entry.js, /drawn.ts)");
    expect(() => mendOf(made)).toThrow("runtime-c.js (/runtime.ts)");
  });

  test("are the entry's, holding the entry alone: nothing would mend it, and the build fails", () => {
    const made = files(
      chunk("index-a.js", { isEntry: true, imports: ["site-b.js"], moduleIds: ["/entry.js"] }),
      chunk("site-b.js", { imports: ["index-a.js"] }),
    );
    expect(() => mendOf(made)).toThrow("the site's files import `site-*` back through index-a.js (/entry.js)");
  });

  test("are still the entry's in the build made once more: it fails rather than build a third time", () => {
    const made = files(
      chunk("index-a.js", { isEntry: true, imports: ["site-b.js"], moduleIds: ["/entry.js", "/drawn.ts"] }),
      chunk("site-b.js", { imports: ["index-a.js"] }),
    );
    expect(() => mendOf(made, { again: true })).toThrow("index-a.js (/entry.js, /drawn.ts)");
  });

  test("are named with their first modules, not all of a runtime", () => {
    const moduleIds = ["/entry.js", ...Array.from({ length: 29 }, (_, at) => `/m${at}.ts`)];
    const made = files(
      chunk("index-a.js", { isEntry: true, imports: ["site-b.js"], moduleIds }),
      chunk("site-b.js", { imports: ["index-a.js"] }),
    );
    expect(() => mendOf(made, { again: true })).toThrow("index-a.js (/entry.js, /m0.ts, /m1.ts, /m2.ts, /m3.ts, and 25 more)");
  });
});

test("a site built again where one was built replaces it", async () => {
  const made = bundle("project");
  try {
    await part("build the site", () => buildSite({ dir: made.dir, out: made.out, qmlc, with: [design] }));
    writeFileSync(join(made.out, "left-over.txt"), "of the last build\n");
    await part("build the site", () => buildSite({ dir: made.dir, out: made.out, qmlc, with: [design] }));
    expect(existsSync(join(made.out, "left-over.txt"))).toBe(false);
    expect(existsSync(join(made.out, "index.html"))).toBe(true);
  } finally {
    made.remove();
  }
});

test("a directory that holds something other than a site it built is not replaced", async () => {
  const made = bundle("project");
  try {
    mkdirSync(made.out);
    writeFileSync(join(made.out, "notes.txt"), "somebody's\n");
    await expect(buildSite({ dir: made.dir, out: made.out, qmlc, with: [design] })).rejects.toThrow(/holds something other than a site this built/);
    expect(readFileSync(join(made.out, "notes.txt"), "utf8")).toBe("somebody's\n");
  } finally {
    made.remove();
  }
});

test("`ljos-web build-site` builds the site from the command line, next to the bundle by default", () => {
  const made = bundle("project");
  try {
    const ran = spawnSync(process.execPath, [join(import.meta.dirname, "../bin/ljos-web.js"), "build-site", made.dir, "--qmlc", qmlc, "--with", design], { encoding: "utf8" });
    expect(ran.stderr.replace(/^note: .*\n/m, "")).toBe("");
    expect(ran.status).toBe(0);
    expect(ran.stdout).toContain(`site: ${made.dir}-site (`);
    expect(existsSync(join(`${made.dir}-site`, "index.html"))).toBe(true);
  } finally {
    made.remove();
  }
});

// Run from anywhere: from beside the bundle, where no node_modules
// holds ljos-web, what the build itself writes (a theme's module)
// still finds the runtime.
test("`ljos-web build-site` builds the site from a directory outside the runtime's package", () => {
  const made = bundle("button");
  try {
    const ran = spawnSync(process.execPath, [join(import.meta.dirname, "../bin/ljos-web.js"), "build-site", made.dir, "--qmlc", qmlc], { cwd: made.root, encoding: "utf8" });
    expect(ran.stderr.replace(/^note: .*\n/m, "")).toBe("");
    expect(ran.status).toBe(0);
    expect(existsSync(join(`${made.dir}-site`, "index.html"))).toBe(true);
  } finally {
    made.remove();
  }
});

test("`ljos-web build-site` says why a bundle is refused, and exits with an error", () => {
  const made = bundle("project", (dir) => writeFileSync(join(dir, "stray.txt"), "?\n"));
  try {
    const ran = spawnSync(process.execPath, [join(import.meta.dirname, "../bin/ljos-web.js"), "build-site", made.dir, "--qmlc", qmlc], { encoding: "utf8" });
    expect(ran.status).toBe(1);
    expect(ran.stderr).toContain("stray.txt is in the bundle but not in its manifest");
  } finally {
    made.remove();
  }
});

test("a site is put in place whole: a copy that fails leaves the one there, and nothing beside it", () => {
  const made = bundle("project");
  try {
    mkdirSync(made.out);
    writeFileSync(join(made.out, "index.html"), "the site there\n");
    const before = readdirSync(made.root).sort();
    expect(() => replaceSite(join(made.root, "no-such-build"), made.out)).toThrow(/ENOENT/);
    expect(readFileSync(join(made.out, "index.html"), "utf8")).toBe("the site there\n");
    expect(readdirSync(made.root).sort()).toEqual(before);
    const built = join(made.root, "build");
    mkdirSync(built);
    writeFileSync(join(built, "index.html"), "the new site\n");
    replaceSite(built, made.out);
    expect(readFileSync(join(made.out, "index.html"), "utf8")).toBe("the new site\n");
    expect(readdirSync(made.root).sort()).toEqual([...before, "build"].sort());
  } finally {
    made.remove();
  }
});

test("the only good copy of a site is kept when it cannot be put back", () => {
  const made = bundle("project");
  try {
    mkdirSync(made.out, { recursive: true });
    writeFileSync(join(made.out, "index.html"), "the site there\n");
    const built = join(made.root, "build");
    mkdirSync(built);
    writeFileSync(join(built, "index.html"), "the new site\n");
    // The first rename, of what is there aside, works; nothing after it does.
    let renames = 0;
    const failing = (from, to) => {
      if (++renames > 1) throw new Error("the disk says no");
      renameSync(from, to);
    };
    expect(() => replaceSite(built, made.out, failing)).toThrow(/the last good site is at /);
    const kept = readdirSync(made.root).filter((name) => name.includes(".old-"));
    expect(kept).toHaveLength(1);
    expect(readFileSync(join(made.root, kept[0], "index.html"), "utf8")).toBe("the site there\n");
    expect(readdirSync(made.root).some((name) => name.includes(".new-"))).toBe(false);
  } finally {
    made.remove();
  }
});

// `use`, given a path to the compiler that means it only from this directory:
// a link below it, so from anywhere else the same path names nothing.
async function withRelativeCompiler(use) {
  const here = mkdtempSync(join(process.cwd(), ".compiler-link-"));
  try {
    const link = join(here, "qmlc");
    symlinkSync(compilerFile, link);
    return await use(relative(process.cwd(), link));
  } finally {
    rmSync(here, { recursive: true, force: true });
  }
}

// The fixture has a theme, so both the runs inside the bundle are of this path.
test("a compiler named by a path from where the build was asked for is found", async () => {
  const made = bundle("project");
  try {
    await withRelativeCompiler((given) => expect(buildSite({ dir: made.dir, out: made.out, qmlc: given, with: [design] })).resolves.toMatchObject({ out: made.out }));
  } finally {
    made.remove();
  }
});

// The plugin reads an entry's theme from the project's directory.
test("the Vite plugin finds a compiler named by a path from where it was given", async () => {
  const made = bundle("project");
  try {
    await withRelativeCompiler((given) =>
      build({
        configFile: false,
        root: made.dir,
        logLevel: "silent",
        plugins: [qml({ qmlc: given, args: ["--root", made.dir], standins: [design] })],
        build: { outDir: made.out, emptyOutDir: true, target: "esnext", lib: { entry: join(made.dir, "Shell.qml"), formats: ["es"], fileName: "page" } },
      }),
    );
    expect(readdirSync(made.out).length).toBeGreaterThan(0);
  } finally {
    made.remove();
  }
});

test("a compiler named bare is looked for on the PATH by the build", async () => {
  const made = bundle("project");
  const path = process.env.PATH;
  try {
    process.env.PATH = `${dirname(compilerFile)}${delimiter}${path}`;
    await expect(buildSite({ dir: made.dir, out: made.out, qmlc: basename(qmlc), with: [design] })).resolves.toMatchObject({ out: made.out });
  } finally {
    process.env.PATH = path;
    made.remove();
  }
});

test("a compiler named bare is found on the PATH, as it is run", () => {
  const env = { PATH: dirname(compilerFile) };
  expect(runnable(basename(qmlc), env)).toBe(true);
  expect(runnable(basename(qmlc), { PATH: join(dirname(compilerFile), "no-such") })).toBe(false);
  expect(runnable(join(dirname(compilerFile), "no-such-compiler"))).toBe(false);
});

test("the commit a site is said to be built with is ljos-web's checkout's, not that of a host it is installed in", () => {
  const made = bundle("project");
  const git = (cwd, ...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
  try {
    const host = join(made.root, "host");
    const installed = join(host, "node_modules/ljos-web");
    mkdirSync(installed, { recursive: true });
    writeFileSync(join(host, "file"), "host\n");
    git(host, "init", "-q");
    git(host, "add", "file");
    git(host, "commit", "-qm", "host");
    expect(builtWith(installed)).toBe(null);

    const checkout = join(made.root, "ljos-web");
    const runtime = join(checkout, "packages/runtime");
    mkdirSync(runtime, { recursive: true });
    writeFileSync(join(runtime, "file"), "ljos-web\n");
    git(checkout, "init", "-q");
    git(checkout, "add", ".");
    git(checkout, "commit", "-qm", "ljos-web");
    expect(builtWith(runtime)).toBe(git(checkout, "rev-parse", "HEAD").stdout.trim());

    expect(builtWith(join(made.root, "bundle"))).toBe(null);
  } finally {
    made.remove();
  }
});

// A site whose readers look into one of its apps (an Observer on it) builds
// that app's files with their places, named by their paths in the bundle,
// and the rest without: a page built for people to use carries none of it.
test("the files a site asks to be inspected are built with where each object is written", async () => {
  const made = bundle("project");
  try {
    await part("build the site", () =>
      buildSite({ dir: made.dir, out: made.out, qmlc, with: [design], inspect: (path) => path === "App/Media/Player.qml" }),
    );
    const scripts = readdirSync(join(made.out, "assets"))
      .filter((name) => name.endsWith(".js"))
      .map((name) => readFileSync(join(made.out, "assets", name), "utf8"))
      .join("\n");
    // The minifier writes a string in whichever quotes it likes.
    expect(scripts).toMatch(/\$at:\[["'`]App\/Media\/Player\.qml["'`],\d+,\d+,["'`]Item["'`]\]/);
    expect(scripts.match(/\$at:\[/g)).toHaveLength(1);
  } finally {
    made.remove();
  }
});

test("what is inspected is said by a function of each file's path in the bundle", async () => {
  const made = bundle("project");
  try {
    await expect(buildSite({ dir: made.dir, out: made.out, qmlc, with: [design], inspect: "App" })).rejects.toThrow(/inspect is a function of a file's path in the bundle/);
    expect(existsSync(made.out)).toBe(false);
  } finally {
    made.remove();
  }
});

test("two builds under way at once do not fill one timings object", async () => {
  const made = bundle("project");
  try {
    const timings = {};
    const build = (out) => buildSite({ dir: made.dir, out, qmlc, with: [design], timings });
    const other = join(made.root, "other");
    const [first, second] = await part("build twice at once", () => Promise.allSettled([build(made.out), build(other)]));
    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("rejected");
    expect(second.reason.message).toMatch(/timings is an empty object for one build to fill/);
    expect(existsSync(other)).toBe(false);
  } finally {
    made.remove();
  }
});

test("a build does not add to the timings an earlier build returned", async () => {
  const made = bundle("project");
  try {
    const { timings } = await part("build the site", () => buildSite({ dir: made.dir, out: made.out, qmlc, with: [design] }));
    const earlier = { ...timings };
    await part("build it again with those timings", () =>
      expect(buildSite({ dir: made.dir, out: made.out, qmlc, with: [design], timings })).rejects.toThrow(/timings is an empty object for one build to fill/),
    );
    expect(timings).toEqual(earlier);
  } finally {
    made.remove();
  }
});
