// What a deploy shoots, read from the site's own lists so that a new
// demo or shell is shot with no change here: the front page in each
// shell the site ships (bundle/shells.js, where the site has shells),
// each pro demo's page (bundle/Demos/pro.json), and each section of the
// demos page, which the capture finds on the page itself (each heading
// of the page is one). Each is shot on each kernel, in light and dark;
// one that draws on a canvas is shot again with WebGPU taken away, so it
// is shot on WebGL 2 as well.
import { existsSync, readFileSync } from "node:fs";

const bundle = new URL("../bundle/", import.meta.url);

export const viewports = {
  desktop: { name: "desktop", width: 1440, height: 900 },
  phone: { name: "phone", width: 390, height: 844 },
};

// The shells the site ships, "" being the default one, which every page
// is prerendered in. shells.js names the others, as the shell keeps them.
export function shellsOf(source) {
  if (source === null) return [""];
  const names = /var names = (\[[^\]]*\]);/.exec(source);
  if (names === null) throw new Error("shells.js: no `var names = [...]` to read the shells from");
  return ["", ...JSON.parse(names[1])];
}

// The key a picked shell is kept under, which the capture sets before
// the page loads.
export function shellKeyOf(source) {
  if (source === null) return null;
  const key = /var key = ("[^"]*");/.exec(source);
  if (key === null) throw new Error("shells.js: no `var key = \"...\"` to keep a shell under");
  return JSON.parse(key[1]);
}

const read = (name) => {
  const file = new URL(name, bundle);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
};

export function siteLists() {
  const shells = read("shells.js");
  return { shells: shellsOf(shells), shellKey: shellKeyOf(shells), pro: JSON.parse(read("Demos/pro.json")) };
}

export const slug = (words) =>
  String(words)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Each page the capture opens, and how much of it a shot is: the
// window (`view`), or each section under a heading (`sections`).
export function targets({ shells, pro }) {
  return [
    ...shells.map((shell) => ({
      kind: "shell",
      target: `shell-${shell || "default"}`,
      title: shell ? `The front page, ${shell} shell` : "The front page, default shell",
      route: "/",
      shell,
      viewports: [viewports.desktop, viewports.phone],
      take: "view",
    })),
    { kind: "demo", target: "demos", title: "Live demos", route: "/demos/", shell: "", viewports: [viewports.desktop], take: "sections" },
    ...pro.map((demo) => ({
      kind: "demo",
      target: `demo-${demo.name}`,
      title: demo.title,
      route: `/demos/${demo.name}/`,
      shell: "",
      viewports: [viewports.desktop, viewports.phone],
      take: "view",
    })),
  ];
}

export const shotId = ({ target, kernel, gpu, scheme, viewport }) => [target, kernel, gpu ?? "dom", scheme, viewport.name].join(".");
