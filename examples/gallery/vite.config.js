import { existsSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import qml from "ljos-web/vite";
import { manifestFile, readManifest } from "./manifest.js";

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));

// `virtual:examples`: the manifest as a module, each example with a `load`
// that imports its entry file where it lies in the corpus. A dynamic import
// an example, so that one is compiled only when it is asked for and one that
// fails takes no other with it.
function examples() {
  const name = "virtual:examples";
  return {
    name: "gallery-examples",
    resolveId: (source) => (source === name ? "\0" + name : null),
    load(id) {
      if (id !== "\0" + name) return null;
      this.addWatchFile(manifestFile);
      const pictures = [];
      const entries = readManifest().map((example, index) => {
        const { id, dir, entry, window, root, rootType, imports, cpp, qt, notes } = example;
        const data = JSON.stringify({ id, dir, entry, window, root, rootType, imports, cpp, qt, notes });
        if (example.reference) pictures.push(`import reference${index} from ${JSON.stringify(example.reference + "?url")};`);
        const reference = example.reference ? `reference${index}` : "null";
        const main = example.main ? `() => import(${JSON.stringify(example.main)})` : "null";
        return `{ ...${data}, reference: ${reference}, main: ${main}, load: () => import(${JSON.stringify(example.entryFile)}) }`;
      });
      return `${pictures.join("\n")}\nexport default [\n${entries.join(",\n")}\n];\n`;
    },
  };
}

// The style of Qt Quick Controls an example has: the one its main.cpp or
// its qtquickcontrols2.conf chooses, as the reference picture was taken with,
// and otherwise the one Qt chooses on the machine the pictures are from.
function style(importer) {
  const example = readManifest().find(({ directory }) => importer?.startsWith(directory + sep));
  if (!example) return undefined;
  // One of the example's own modules is a style it brings itself.
  if (example.qt.style) return example.modules?.[example.qt.style] ? join(example.directory, example.modules[example.qt.style]) : example.qt.style;
  const conf = example.qt.controlsConf && join(example.directory, example.qt.controlsConf);
  const chosen = conf && existsSync(conf) ? readFileSync(conf, "utf8").match(/^\s*Style\s*=\s*(\w+)/m)?.[1] : null;
  if (chosen) return chosen === "Default" ? "Basic" : chosen;
  return "Fusion";
}

// What an example's qtquickcontrols2.conf says besides the style: the theme
// and the colours its style has.
function controls(importer) {
  const example = readManifest().find(({ directory }) => importer?.startsWith(directory + sep));
  const conf = example?.qt.controlsConf && join(example.directory, example.qt.controlsConf);
  return conf && existsSync(conf) ? conf : undefined;
}

// What the compiler is told of the example a file is of: that its main.cpp
// has paths taken from the file they are written in, as Qt 5 took them.
function args(file) {
  const example = readManifest().find(({ directory }) => file.startsWith(directory + sep));
  return example?.qt.env?.QML_COMPAT_RESOLVE_URLS_ON_ASSIGNMENT === "1" ? ["--urls-on-assignment"] : [];
}

// Where the example a file is of looks for its modules before its own
// directory, as its build or its main.cpp adds them to the import path.
function importPaths(file) {
  const example = readManifest().find(({ directory }) => file.startsWith(directory + sep));
  return (example?.importPaths ?? []).map((path) => join(example.directory, path));
}

// The QML that stands in for the C++ of the example a file is of, or is
// itself one of the files that do.
function standins(file) {
  const example = readManifest().find(
    ({ directory, standins }) => standins && (file.startsWith(directory + sep) || file.startsWith(standins + sep)),
  );
  return example ? [example.standins] : [];
}

// What an example's build downloads and puts among its files is not among
// them in the corpus: a file asked for there that is not there is served from
// where it has been fetched to. What an example downloads itself is served
// from there too, for a page that is to ask nobody else: to any page, as the
// place it is downloaded from serves it.
function assets() {
  const fetched = () => readManifest().flatMap((example) => example.fetched);
  const served = () => readManifest().flatMap((example) => example.served);
  // Vite reads the address of a file as `decodeURI` does: a comma in a name
  // (`DynaPuff-VariableFont_wdth,wght.ttf`) is to be left as it is.
  const named = (part) => encodeURI(part).replace(/[?#]/g, encodeURIComponent);
  const kept = (directory, rest) => `/@fs${join(directory, decodeURIComponent(rest)).split(sep).map(named).join("/")}`;
  return {
    name: "gallery-assets",
    config: () => ({ server: { fs: { allow: [...fetched(), ...served()].map(([, from]) => from) } } }),
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const [asked, query = ""] = request.url.split("?");
        const address = served().find(([, , local]) => asked.startsWith(local));
        if (address) {
          const rest = asked.slice(address[2].length);
          response.setHeader("Access-Control-Allow-Origin", "*");
          if (!existsSync(join(address[1], decodeURIComponent(rest)))) {
            response.statusCode = 404;
            response.end();
            return;
          }
          request.url = kept(address[1], rest);
        } else if (asked.startsWith("/@fs/")) {
          const file = decodeURIComponent(asked.slice("/@fs".length));
          const place = fetched().find(([to]) => file.startsWith(to + sep));
          if (place && !existsSync(file)) request.url = `${kept(place[1], file.slice(place[0].length + 1))}${query && "?" + query}`;
        }
        next();
      });
    },
  };
}

// The plugin stops the build at a file `qmlc` does not take. Here that is the
// usual case and must not stop anything: the file becomes a module that
// throws the compiler's message when it is imported, so the example that
// needs it fails, with the reason, in the page.
function tolerant(plugin) {
  return {
    ...plugin,
    load(id) {
      try {
        return plugin.load.call(this, id);
      } catch (error) {
        const message = String(error?.message ?? error);
        return { code: `throw new Error(${JSON.stringify(message)});\nexport default undefined;\n`, map: null };
      }
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [examples(), assets(), tolerant(qml({ qmlc: process.env.QMLC ?? path("../../target/debug/qmlc"), args, style, controls, standins, importPaths }))],
  resolve: {
    // Qt's examples have no app behind them: nothing to find here.
    alias: { "ljos-web/host": path("./host.js") },
    // The QML is in the corpus, outside this package: what its compiled
    // output imports still resolves from here.
    dedupe: ["solid-js", "@solidjs/web", "ljos-web"],
  },
  // Known before the first example is loaded, so the server does not reload
  // the page to bundle them when it meets them.
  optimizeDeps: { include: ["solid-js", "@solidjs/web"] },
  // The server tells every page of an error in any: its overlay would cover an
  // example that renders with what another one lacks.
  server: { fs: { allow: [path("../..")] }, hmr: { overlay: false } },
});
