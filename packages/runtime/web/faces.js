// `ljos-web faces`: an application crate's native types as faces. It builds
// the crate for wasm32 with its `web` feature, through a small crate that
// exports the application's `register`; reads what the macros wrote into the
// wasm; and writes the faces, the JavaScript wasm-bindgen makes and the
// `ljostypes.json` the compiler learns the types from (docs/LJOS_WEB.md A22).
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SECTION = "ljos_web_types";
const TARGET = "wasm32-unknown-unknown";

export class FaceError extends Error {}

function leb(bytes, at) {
  let value = 0;
  let shift = 0;
  for (;;) {
    const byte = bytes[at++];
    value += (byte & 0x7f) * 2 ** shift;
    if (!(byte & 0x80)) return [value, at];
    shift += 7;
  }
}

// The lines of the section and the wasm without it: a page has no use for
// them, and they would cost a type's whole description in every download.
export function takeSection(wasm, name = SECTION) {
  const lines = [];
  const kept = [wasm.subarray(0, 8)];
  let at = 8;
  while (at < wasm.length) {
    const start = at;
    const id = wasm[at++];
    let size;
    [size, at] = leb(wasm, at);
    const end = at + size;
    let mine = false;
    if (id === 0) {
      const [length, from] = leb(wasm, at);
      mine = wasm.toString("utf8", from, from + length) === name;
      if (mine) lines.push(wasm.toString("utf8", from + length, end));
    }
    if (!mine) kept.push(wasm.subarray(start, end));
    at = end;
  }
  return { text: lines.join(""), wasm: Buffer.concat(kept) };
}

// The macros write a line per derive, per `#[qml_impl]` and per singleton, in
// whatever order the linker met them.
export function typesOf(text) {
  const derives = new Map();
  const impls = new Map();
  const singletons = new Map();
  for (const line of text.split("\n")) {
    const trimmed = line.replace(/^\0+|\0+$/g, "");
    if (!trimmed) continue;
    const entry = JSON.parse(trimmed);
    if (entry.rust) derives.set(entry.rust, entry);
    else if (entry.impl) impls.set(entry.impl, entry);
    else if (entry.singleton) singletons.set(entry.singleton, entry);
  }
  // What only a group needs is no type of its own to QML.
  const groups = new Set();
  for (const type of derives.values())
    for (const property of type.props) if (property.group) groups.add(property.of);
  const types = [];
  for (const type of derives.values()) {
    const merged = { ...type, signals: [], methods: [], complete: false, singleton: false };
    const impl = impls.get(type.rust);
    if (impl) Object.assign(merged, { signals: impl.signals, methods: impl.methods, complete: impl.complete });
    const single = singletons.get(type.rust);
    if (single) Object.assign(merged, { singleton: true, scope: single.scope });
    merged.props = type.props.map((property) => {
      if (!property.group) return property;
      const of = derives.get(property.of);
      if (!of) throw new FaceError(`group \`${type.rust}.${property.name}\`: ${property.of} has no #[derive(QmlObject)]`);
      return { ...property, members: of.props.filter((member) => !member.group) };
    });
    // A type with no module is one QML can't name, as on the desktop: an
    // attached type, or a group's. Only an attached one has objects of its own.
    if (groups.has(type.rust)) merged.groupOnly = true;
    types.push(merged);
  }
  return types.sort((one, other) => `${one.module ?? UNNAMED}.${one.name}`.localeCompare(`${other.module ?? UNNAMED}.${other.name}`));
}

// Where a dump's stand-ins put a type with no module.
const UNNAMED = "+unnamed";
const DUMP_TYPE = { int: "int", real: "double", bool: "bool", string: "QString", var: "QVariant" };

function dumpProperty(property, types) {
  if (property.group) {
    const of = types.find((one) => one.rust === property.of);
    return { name: property.name, type: of?.name ?? property.of, kind: "group", list: false, readonly: true, final: false, required: false, constant: true, group: true, notify: null };
  }
  const kind = property.enum ? (property.flags ? "flags" : "enum") : property.object ? "object" : "value";
  return {
    name: property.name,
    type: property.enum ?? property.object ?? DUMP_TYPE[property.kind],
    kind,
    list: false,
    readonly: property.readonly,
    final: false,
    required: property.required,
    constant: property.constant,
    group: false,
    notify: property.notify ? `${property.name}Changed` : null,
  };
}

function dumpParameters(parameters) {
  return parameters.map(({ name, type }) => ({ name, type: DUMP_TYPE[type] }));
}

export function dumpOf(types, enums = new Map()) {
  const modules = new Map();
  const unnamed = [];
  for (const type of types) {
    const attached = type.attached ? types.find((one) => one.rust === type.attached) : null;
    const entry = {
      name: type.name,
      since: "1.0",
      base: type.base === "Item" ? "Item" : "QtObject",
      baseModule: type.base === "Item" ? "QtQuick" : "QtQml",
      singleton: type.singleton,
      enums: enums.get(type.rust) ?? [],
      creatable: !type.uncreatable && !type.singleton,
      defaultProperty: type.default,
      attached: attached?.name ?? null,
      properties: type.props.map((property) => dumpProperty(property, types)),
      signals: type.signals.map(({ name, parameters }) => ({ name, parameters: dumpParameters(parameters) })),
      methods: type.methods.map(({ name, parameters, returns }) => ({ name, parameters: dumpParameters(parameters), returnType: DUMP_TYPE[returns] ?? "void" })),
    };
    if (!type.module) {
      unnamed.push(entry);
      continue;
    }
    if (!modules.has(type.module)) modules.set(type.module, []);
    modules.get(type.module).push(entry);
  }
  return {
    format: 2,
    modules: [...modules].map(([uri, entries]) => ({ uri, versions: ["1.0"], types: entries })),
    unnamed,
  };
}

const modulePath = (module) => module.split(".").join("/");
const fileOf = (type) => `${type.module ? modulePath(type.module) : UNNAMED}/${type.name}.js`;

function relativeImport(from, to) {
  const path = relative(dirname(from), to).split("\\").join("/");
  return path.startsWith(".") ? path : `./${path}`;
}

// One type's module: what a compiled `import` resolves to.
export function faceSource(type, types, crate) {
  const file = fileOf(type);
  const lines = [
    `// Generated by \`ljos-web faces\` from ${type.rust}. Do not edit.`,
    `import ${JSON.stringify(relativeImport(file, "_init.js"))};`,
    `import { ${type.rust} as Rust } from ${JSON.stringify(relativeImport(file, `../${crate}.js`))};`,
    `import { defineFace } from "ljos-web/web/face";`,
  ];
  const visual = type.base === "Item";
  if (visual) {
    lines.push(`import * as wasm from ${JSON.stringify(relativeImport(file, `../${crate}.js`))};`);
    lines.push(`import { Item, visual } from "ljos-web/web/visual";`);
  } else {
    lines.push(`import { QtObject } from "ljos-web/object";`);
  }
  if (type.singleton) lines.push(`import { $singleton } from "ljos-web/object";`);
  let attached = "";
  if (type.attached) {
    const other = types.find((one) => one.rust === type.attached);
    if (!other) throw new FaceError(`${type.rust}'s attached type ${type.attached} has no #[derive(QmlObject)]`);
    lines.push(`import Attached from ${JSON.stringify(relativeImport(file, fileOf(other)))};`);
    attached = ", attachedType: Attached";
  }
  const { rust: _rust, module: _module, base: _base, attached: _attached, singleton: _singleton, scope: _scope, ...meta } = type;
  lines.push("");
  lines.push(
    `const Type = defineFace({ ...${JSON.stringify(meta)}${attached} }, ${visual ? "Item" : "QtObject"}, Rust${visual ? ", visual(wasm)" : ""});`,
  );
  // DECISION: an engine-scoped and a window-scoped singleton are both one
  // object of the page: a page is one window.
  lines.push(
    type.singleton
      ? `export default $singleton(Type, Type.enums, ${JSON.stringify(`${type.module}.${type.name}`)});`
      : "export default Type;",
  );
  return `${lines.join("\n")}\n`;
}

function run(command, args, options) {
  const ran = spawnSync(command, args, { stdio: "inherit", ...options });
  if (ran.error) throw new FaceError(`${command}: ${ran.error.message}`);
  if (ran.status !== 0) throw new FaceError(`${command} ${args[0]} failed`);
}

// DECISION: the entry names no `ljos`. `&Default::default()` takes its type
// from `register`'s signature, so it cannot disagree with the application
// over which `ljos`, and needs no dependency the application didn't choose.
function writeEntry(dir, crate, path, register) {
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "Cargo.toml"),
    `# Generated by \`ljos-web faces\`.
[package]
name = "ljos_web_entry"
version = "0.0.0"
edition = "2024"
publish = false

[lib]
crate-type = ["cdylib"]

[dependencies]
app = { path = ${JSON.stringify(path)}, package = ${JSON.stringify(crate)}, features = ["web"], default-features = false }

[workspace]

[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
panic = "abort"
`,
  );
  writeFileSync(
    join(dir, "src/lib.rs"),
    `// Generated by \`ljos-web faces\`.
#[unsafe(no_mangle)]
pub extern "C" fn ljos_web_register() {
    ${register}(&::core::default::Default::default());
}
`,
  );
}

// `#[qml(enums = …)]` is a function in the application, so the only way to
// know a type's keys for the compiler is to ask the wasm: the one time this
// tool runs anything of the application's, and only for a type that has them.
async function enumsOf(types, out, crate) {
  const having = types.filter((type) => type.enums);
  const enums = new Map();
  if (having.length === 0) return enums;
  const module = await import(pathToFileURL(join(out, `${crate}.js`)).href);
  await module.default({ module_or_path: readFileSync(join(out, `${crate}_bg.wasm`)) });
  for (const type of having) {
    const given = module[type.rust].__ljos_enums() ?? [];
    enums.set(
      type.rust,
      given.map(([name, ...pairs]) => {
        const keys = [];
        for (let at = 0; at < pairs.length; at += 2) keys.push([pairs[at], pairs[at + 1]]);
        return { name, keys };
      }),
    );
  }
  return enums;
}

export async function buildFaces({ crate: dir, out, register = "app::register", bindgen = process.env.WASM_BINDGEN ?? "wasm-bindgen" }) {
  const root = resolve(dir);
  const manifest = readFileSync(join(root, "Cargo.toml"), "utf8");
  const name = /^\[package\][^[]*?^name\s*=\s*"([^"]+)"/ms.exec(manifest)?.[1];
  if (!name) throw new FaceError("no [package] name in Cargo.toml");
  if (!/^\s*web\s*=/m.test(manifest)) throw new FaceError('needs a feature: web = ["ljos/web"]');
  const crate = name.replaceAll("-", "_");
  const target = process.env.CARGO_TARGET_DIR ? resolve(process.env.CARGO_TARGET_DIR) : join(root, "target");
  const entry = join(target, "ljos-web", crate);
  const pkg = out ? resolve(out) : join(root, "pkg");
  writeEntry(entry, name, root, register);
  // From the application's directory, so that its `.cargo/config.toml` counts.
  run("cargo", ["build", "--release", "--target", TARGET, "--manifest-path", join(entry, "Cargo.toml"), "--target-dir", target], { cwd: root });

  const built = readFileSync(join(target, TARGET, "release", "ljos_web_entry.wasm"));
  const { text, wasm } = takeSection(built);
  const types = typesOf(text);
  const stripped = join(entry, `${crate}.wasm`);
  writeFileSync(stripped, wasm);
  run(bindgen, [stripped, "--out-dir", pkg, "--target", "web"]);

  const faces = join(pkg, "faces");
  mkdirSync(faces, { recursive: true });
  writeFileSync(
    join(faces, "_init.js"),
    `// Generated by \`ljos-web faces\`. Compiled QML makes objects synchronously,
// so the wasm is awaited as this loads, and the hooks are registered with it.
import init from ${JSON.stringify(`../${crate}.js`)};

const wasm = await init();
wasm.ljos_web_register();
`,
  );
  const modules = new Map();
  for (const type of types) {
    if (type.groupOnly) continue;
    const file = join(faces, fileOf(type));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, faceSource(type, types, crate));
    if (!type.module) continue;
    if (!modules.has(type.module)) modules.set(type.module, []);
    modules.get(type.module).push(type.name);
  }
  for (const [module, names] of modules) {
    const lines = names.map((one) => `export { default as ${one} } from "./${one}.js";`);
    writeFileSync(join(faces, modulePath(module), "index.js"), `// Generated by \`ljos-web faces\`.\n${lines.join("\n")}\n`);
  }
  const enums = await enumsOf(types, pkg, crate);
  writeFileSync(join(faces, "ljostypes.json"), `${JSON.stringify(dumpOf(types, enums), null, 1)}\n`);
  return { out: pkg, types };
}
