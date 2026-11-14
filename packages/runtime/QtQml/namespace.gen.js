// Writes namespace.ts: the enums of Qt's `Qt` namespace, with the numbers
// Qt's own header gives them.
//
//     node namespace.gen.js [path/to/QtCore/qnamespace.h]
//
// Only the enums the header registers with the meta-object system
// (Q_ENUM_NS, Q_FLAG_NS) are written: those are the ones QML can see.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const header = process.argv[2] ?? "/usr/include/qt6/QtCore/qnamespace.h";
const source = readFileSync(header, "utf8");
const version = /QTCORE_VERSION_STR "([^"]+)"/.exec(readFileSync(join(header, "../qtcoreversion.h"), "utf8"))?.[1];

// What the preprocessor would leave of the first `namespace Qt { }`, for
// moc: deprecated members are still members, Qt 7's values are not ours yet.
function preprocess(text) {
  const start = text.indexOf("namespace Qt {");
  const end = text.indexOf("\n}\n", start);
  const kept = [];
  const stack = [];
  for (const line of text.slice(start, end).split("\n")) {
    const directive = /^\s*#\s*(\w+)\s*(.*)$/.exec(line);
    if (!directive) {
      if (stack.every(Boolean)) kept.push(line);
      continue;
    }
    const [, word, condition] = directive;
    if (word === "if" || word === "ifdef" || word === "ifndef") {
      stack.push(
        /^QT_DEPRECATED_SINCE|^QT_VERSION < QT_VERSION_CHECK\(7/.test(condition) ||
          (word === "ifndef" && condition !== "Q_MOC_RUN"),
      );
    } else if (word === "else") stack.push(!stack.pop());
    else if (word === "endif") stack.pop();
  }
  return kept
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/Q_DECL_ENUMERATOR_DEPRECATED(_X\s*\((\s*"[^"]*"[\s\\]*)+\))?/g, "");
}

// The value of an enumerator: numbers, earlier enumerators, and the few
// operators the header uses.
function evaluate(expression, known) {
  const tokens = expression.match(/0x[0-9a-f]+u?|\d+u?|(?:\w+::)*\w+|<<|[|&~()+-]/gi);
  let at = 0;
  const primary = () => {
    const token = tokens[at++];
    if (token === "(") {
      const value = or();
      at++;
      return value;
    }
    if (token === "~") return ~primary();
    if (token === "-") return -primary();
    if (/^\d/.test(token)) return Number(token.replace(/u$/i, ""));
    const name = token.split("::").pop();
    if (!(name in known)) throw new Error(`unknown enumerator ${token} in ${expression}`);
    return known[name];
  };
  const shift = () => {
    let value = primary();
    while (tokens[at] === "<<") {
      at++;
      value *= 2 ** primary();
    }
    return value;
  };
  const sum = () => {
    let value = shift();
    while (tokens[at] === "+" || tokens[at] === "-") value = tokens[at++] === "+" ? value + shift() : value - shift();
    return value;
  };
  const and = () => {
    let value = sum();
    while (tokens[at] === "&") {
      at++;
      value &= sum();
    }
    return value;
  };
  const or = () => {
    let value = and();
    while (tokens[at] === "|") {
      at++;
      value |= and();
    }
    return value;
  };
  // QML sees an enum's value as an int.
  return or() | 0;
}

const text = preprocess(source);
const all = {};
const enums = {};
for (const [, name, body] of text.matchAll(/enum\s+(?:class\s+)?(\w+)\s*\{([^}]*)\}/g)) {
  const members = {};
  let previous = -1;
  for (const entry of body.split(",")) {
    const [member, expression] = entry.split("=").map((part) => part.trim());
    if (!member) continue;
    previous = expression ? evaluate(expression, all) : previous + 1;
    members[member] = all[member] = previous;
  }
  enums[name] = members;
}

// `Q_DECLARE_FLAGS(Alignment, AlignmentFlag)`: QML knows the enum by the
// name of its flags when that is what was registered.
const flags = Object.fromEntries([...text.matchAll(/Q_DECLARE_FLAGS\((\w+),\s*(\w+)\)/g)].map(([, flag, name]) => [flag, name]));
const registered = {};
for (const [, name] of text.matchAll(/Q_(?:ENUM|FLAG)_NS\((\w+)\)/g)) {
  const members = enums[flags[name] ?? name];
  if (!members) throw new Error(`${name} is registered but not declared`);
  registered[name] = members;
}

const number = (value) => (value >= 0x100 && value % 0x100 === 0 ? `0x${value.toString(16)}` : String(value));
const lines = Object.entries(registered).map(([name, members]) => {
  const body = Object.entries(members).map(([member, value]) => `${member}: ${number(value)}`);
  return `  ${name}: { ${body.join(", ")} },`;
});
const output = `// The enums of the \`Qt\` namespace QML can see, from Qt ${version}'s qnamespace.h.
// Written by namespace.gen.js. Not edited by hand.
// prettier-ignore
export const enums = {
${lines.join("\n")}
};
`;
writeFileSync(join(import.meta.dirname, "namespace.ts"), output);
console.log(`${Object.keys(registered).length} enums, ${new Set(Object.values(registered).flatMap(Object.keys)).size} names`);
