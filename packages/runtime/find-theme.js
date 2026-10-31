// The theme file an entry reads when none is named, among the files a host
// was given (`names`, `/`-separated paths from one top): `theme.json` beside
// the entry, then in each directory above it up to `project`, both included,
// and nothing above it. The search `ljos_web::theme::nearest` makes, for a
// host with no compiler in the page and for the site builder, which holds a
// bundle to the files it lists. Apart from `theme.js` so that Node can have
// it without the runtime.
export function findTheme(names, entry, { project = "" } = {}) {
  const has = names instanceof Set ? (name) => names.has(name) : (name) => names.includes(name);
  const parts = (path) => path.split("/").filter((part) => part !== "" && part !== ".");
  const top = parts(project);
  const dir = parts(entry).slice(0, -1);
  for (;;) {
    const file = [...dir, "theme.json"].join("/");
    if (has(file)) return file;
    const inside = top.every((part, at) => dir[at] === part);
    if (!inside || dir.length === top.length || dir.length === 0) return null;
    dir.pop();
  }
}
