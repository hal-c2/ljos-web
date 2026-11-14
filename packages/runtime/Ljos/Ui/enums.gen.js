// Writes enums.js: the enums of Qt's `Qt` namespace as the types of
// `Ljos.Ui` Ljós gives them (`Align.Left`, `Key.Digit0`), from the table
// ljos-ui writes from its engine.
//
//     node enums.gen.js path/to/ljos-ui/crates/qt_types/src/ljos_enums.txt
//
// The table is a line per enum, `<type> flags|enum <Qt's enum>`, then a
// tab-indented line per key, `<Qt's key> <Ljós's key> <number>`. A type
// whose name has a dot (`Permission.Status`) is a member of the first.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const table = process.argv[2];
if (!table) throw new Error("usage: node enums.gen.js path/to/ljos_enums.txt");

const types = [];
let current = null;
for (const line of readFileSync(table, "utf8").split("\n")) {
  if (line.startsWith("#") || line.trim() === "") continue;
  if (line.startsWith("\t")) {
    const [, key, number] = line.trim().split(/\s+/);
    // Qt's aliases (`XButton1` and `BackButton`) may share a Ljós key;
    // the first is what the table means by it.
    if (!current.keys.has(key)) current.keys.set(key, Number(number));
    continue;
  }
  const [name, kind] = line.split(/\s+/);
  current = { name, kind, keys: new Map() };
  types.push(current);
}

const object = (keys) => `{ ${[...keys].map(([key, number]) => `${key}: ${number}`).join(", ")} }`;

const nested = new Map();
const flat = [];
for (const type of types) {
  const [outer, inner] = type.name.split(".");
  if (inner) {
    if (!nested.has(outer)) nested.set(outer, []);
    nested.get(outer).push([inner, type]);
  } else flat.push(type);
}

const lines = [
  "// The enums of Qt's `Qt` namespace as the types of `Ljos.Ui`, from",
  "// ljos-ui's `crates/qt_types/src/ljos_enums.txt`. Written by enums.gen.js.",
  "// Not edited by hand.",
  "// prettier-ignore",
];
for (const type of flat) lines.push(`export const ${type.name} = Object.freeze(${object(type.keys)});`);
for (const [outer, members] of nested) {
  const inside = members.map(([inner, type]) => `${inner}: Object.freeze(${object(type.keys)})`).join(", ");
  lines.push(`export const ${outer} = Object.freeze({ ${inside} });`);
}

writeFileSync(join(import.meta.dirname, "enums.js"), `${lines.join("\n")}\n`);
