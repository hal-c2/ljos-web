// A plain static server for a built site, for the tests and for a
// person reading it locally: `node scripts/serve.mjs [dir] [port] [base]`.
// The base is where the site stands below the address's root, as
// the build was told (`LJOS_SITE_BASE`, `/` when unset): served
// there and nowhere else, so a page that asks outside it is caught.
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const dir = resolve(process.argv[2] ?? "dist");
const port = Number(process.argv[3] ?? 4471);
const base = process.argv[4] ?? process.env.LJOS_SITE_BASE ?? "/";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".wasm": "application/wasm" };

createServer((request, response) => {
  let path = decodeURIComponent(new URL(request.url, "http://site").pathname);
  // The bare project path is sent on to the base, as Pages does.
  if (base !== "/" && path === base.slice(0, -1)) {
    response.writeHead(301, { location: base }).end();
    return;
  }
  if (!path.startsWith(base)) {
    response.writeHead(404).end(`not here: the site stands at ${base}\n`);
    return;
  }
  path = `/${path.slice(base.length)}`;
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(dir, path));
  if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end("not here\n");
    return;
  }
  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
}).listen(port, "127.0.0.1", () => console.log(`site-ljos: ${dir} at http://127.0.0.1:${port}${base}`));
