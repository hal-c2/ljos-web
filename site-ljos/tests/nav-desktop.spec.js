// nav.js's back and forward on the desktop (`mise run site:native`),
// where it keeps the list of pages itself: run in node, with a shell
// and the files it reads made up here, as no browser has that branch.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
// A QML JavaScript library; its pragma is no JavaScript.
const source = readFileSync(join(here, "../bundle/nav.js"), "utf8").replace(/^\.pragma library\s*$/m, "");

// The site at /site/: each page's reading is a file there, and a page
// named in `missing` has none. Each read answers when `answer` is called,
// so a test says in which order reads come back.
function desktop({ missing = [] } = {}) {
  const waiting = [];
  const warned = [];
  const shown = [];
  let scrolled = 0;
  class XMLHttpRequest {
    static DONE = 4;
    open(method, file) {
      this.file = file;
    }
    send() {
      waiting.push(() => {
        const route = this.file.replace("file:///site", "").replace(/page\.json$/, "");
        this.responseText = missing.includes(route) ? "" : JSON.stringify({ route });
        this.readyState = 4;
        this.onreadystatechange();
      });
    }
  }
  const shell = {
    title: (route) => (["/", "/a/", "/b/", "/c/"].includes(route) ? route : null),
    reading: () => "page.json",
    show: (route, fragment, offset) => shown.push({ route, fragment, offset }),
    offset: () => scrolled,
  };
  const context = vm.createContext({
    Promise,
    JSON,
    String,
    Error,
    XMLHttpRequest,
    console: { warn: (said) => warned.push(said), log() {} },
    Qt: { application: { arguments: ["ljos", "--site=/site"] }, openUrlExternally() {} },
  });
  vm.runInContext(source, context);
  context.follow("/", shell);
  const settle = () => new Promise((done) => setTimeout(done, 0));
  return {
    nav: context,
    list: () => ({ routes: context.desktop.stack.map((entry) => entry.route), at: context.desktop.at, aim: context.desktop.aim }),
    shown,
    warned,
    scroll: (to) => (scrolled = to),
    // Answers the reads asked for so far, oldest first, then lets the
    // promises run.
    async answer(count = waiting.length) {
      for (const read of waiting.splice(0, count)) read();
      await settle();
    },
  };
}

test("on the desktop a page that cannot be read leaves the list as it was, and is warned about", async () => {
  const site = desktop({ missing: ["/b/"] });
  site.nav.go("/a/");
  await site.answer();
  expect(site.list()).toEqual({ routes: ["/", "/a/"], at: 1, aim: 1 });
  site.nav.go("/b/");
  await site.answer();
  expect(site.list()).toEqual({ routes: ["/", "/a/"], at: 1, aim: 1 });
  expect(site.warned.join("\n")).toContain("file:///site/b/page.json");
  expect(site.shown.map((page) => page.route)).toEqual(["/a/"]);
  // Back still goes where it went before.
  expect(site.nav.step(-1)).toBe(true);
  await site.answer();
  expect(site.list()).toEqual({ routes: ["/", "/a/"], at: 0, aim: 0 });
  expect(site.shown.at(-1).route).toBe("/");
});

test("on the desktop a link to the page and fragment shown makes no new entry; another fragment does", async () => {
  const site = desktop();
  site.nav.go("/a/");
  await site.answer();
  site.nav.go("/a/");
  await site.answer();
  expect(site.list().routes).toEqual(["/", "/a/"]);
  site.nav.go("/a/#more");
  await site.answer();
  expect(site.list().routes).toEqual(["/", "/a/", "/a/"]);
  expect(site.shown.at(-1)).toEqual({ route: "/a/", fragment: "#more", offset: null });
});

test("on the desktop two quick Back presses go back two pages", async () => {
  const site = desktop();
  for (const route of ["/a/", "/b/"]) {
    site.nav.go(route);
    await site.answer();
  }
  expect(site.nav.step(-1)).toBe(true);
  expect(site.nav.step(-1)).toBe(true);
  // The first press is overtaken by the second; there is none further back.
  expect(site.nav.step(-1)).toBe(false);
  await site.answer();
  expect(site.list()).toEqual({ routes: ["/", "/a/", "/b/"], at: 0, aim: 0 });
  expect(site.shown.at(-1).route).toBe("/");
});

test("on the desktop the page left keeps where it was, even when Back and Forward come before a read", async () => {
  const site = desktop();
  site.nav.go("/a/");
  await site.answer();
  site.scroll(120);
  site.nav.step(-1);
  site.nav.step(1);
  await site.answer();
  expect(site.list().at).toBe(1);
  expect(site.shown.at(-1)).toEqual({ route: "/a/", fragment: "", offset: 120 });
});
