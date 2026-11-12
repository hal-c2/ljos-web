// A shell a visitor dropped, made from what the compiler gave of it: the
// objects as written (ljos_ir's `CompiledFile`, as JSON) and each of its
// expressions as a tier-1 program, which this runs. There is no JavaScript
// of the shell's to run: what it may do is what the programs can say, and
// the compiler let them say only what names the shell's own objects, its
// blocks' state and actions, QtQuick's types and pure builtins.
//
// What is checked here as well, should a program say more than the compiler
// let it: a read is of a member a QML object has, never a function, a page
// object or one of JavaScript's; a write is to a property; a call is of one
// of the builtins, or of an action of a block the shell names. And every
// run has a budget of steps: a binding that would run forever is stopped,
// warned of, and keeps the value it had.
import { createComponent } from "solid-js";
import { $bool, $color, $int, $object, $real, $string, slot } from "../../object.js";
import * as Quick from "../../QtQuick/index.js";
import { Color } from "../../QtQuick/color.js";
import { Qt, qsTr, qsTrId, qsTranslate } from "../../QtQml/Qt.js";

// Steps one run may take: far more than any binding a person writes, far
// fewer than make a page hang.
export const BUDGET = 100_000;

const FORBIDDEN = new Set(["constructor", "__proto__", "prototype", "caller", "callee", "arguments"]);
// What a shell may write on an object: a property of its type, or one the
// object's use of a block declares (`held.js`).
const written = (target, key) => slot(target, key) || [...(target.$uses ?? [])].some((use) => slot(use, key));

const forbidden = (name) => typeof name !== "string" || FORBIDDEN.has(name) || name[0] === "$" || name.startsWith("__");

class Refused extends Error {}
class Runaway extends Error {}

// A number of a program is the bits of a double, written in decimal: a
// JavaScript number cannot hold them.
const bits = new BigUint64Array(1);
const double = new Float64Array(bits.buffer);
function number(text) {
  bits[0] = BigInt(text);
  return double[0];
}

function constant(given) {
  if (given === "Undefined") return undefined;
  if (given === "Null") return null;
  if ("Bool" in given) return given.Bool;
  if ("Number" in given) return number(given.Number);
  return given.String;
}

function literal(given) {
  if (given === "Undefined") return undefined;
  if (given === "Null") return null;
  const [[kind, value]] = Object.entries(given);
  if (kind === "Number" || kind === "String" || kind === "Color" || kind === "Bool") return value;
  throw new Refused(`a ${kind} is not a value a shell gives`);
}

// What a value read may be: not a function to call, nor the page.
function readable(value) {
  if (typeof value === "function") throw new Refused("a function is not a value a shell reads");
  if (value === globalThis || (typeof Node !== "undefined" && value instanceof Node) || (typeof Window !== "undefined" && value instanceof Window)) {
    throw new Refused("the page is not a value a shell reads");
  }
  return value;
}

function read(object, name) {
  if (forbidden(name)) throw new Refused(`\`${name}\` is not in a shell's scope`);
  if (object == null) throw new TypeError(`cannot read \`${name}\` of ${object}`);
  if (typeof object !== "object" && typeof object !== "string") throw new Refused(`\`${name}\` of a ${typeof object} is not in a shell's scope`);
  return readable(object[name]);
}

const quick = (name) => {
  const Type = Quick[name];
  if (typeof Type !== "function" || !Type.proto) throw new Refused(`\`${name}\` is not a type a shell makes`);
  return Type;
};

const string = (value) => typeof value === "string";
const primitive = (value) => typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof Color;
const math = (name) => Math[name[4].toLowerCase() + name.slice(5)];

const BUILTINS = {
  Number,
  String,
  Boolean,
  IsNaN: isNaN,
  IsFinite: isFinite,
  QtRgba: (...args) => Qt.rgba(...args),
  QtHsla: (...args) => Qt.hsla(...args),
  QtHsva: (...args) => Qt.hsva(...args),
  QtPoint: (...args) => Qt.point(...args),
  QtSize: (...args) => Qt.size(...args),
  QtRect: (...args) => Qt.rect(...args),
  QtVector2d: (...args) => Qt.vector2d(...args),
  QtVector3d: (...args) => Qt.vector3d(...args),
  QtVector4d: (...args) => Qt.vector4d(...args),
  QtQuaternion: (...args) => Qt.quaternion(...args),
  QtLighter: (...args) => Qt.lighter(...args),
  QtDarker: (...args) => Qt.darker(...args),
  // Its first is the context, which the compiler gives.
  QsTr: (_context, ...args) => qsTr(...args),
  QsTranslate: qsTranslate,
  QsTrId: qsTrId,
  TrNoop: (source) => source,
  TranslateNoop: (_context, source) => source,
  Arg: (self, ...args) => self.arg(...args),
  ToFixed: (self, digits) => self.toFixed(digits),
  ToString: (self, ...args) => self.toString(...args),
  ToUpperCase: (self) => self.toUpperCase(),
  ToLowerCase: (self) => self.toLowerCase(),
  Trim: (self) => self.trim(),
};

// What a method's receiver must be.
const RECEIVERS = { Arg: string, ToUpperCase: string, ToLowerCase: string, Trim: string, ToFixed: (value) => typeof value === "number", ToString: primitive };

function builtin(name) {
  const f = name.startsWith("Math") ? math(name) : BUILTINS[name];
  if (typeof f !== "function") throw new Refused(`\`${name}\` is not a builtin of a shell`);
  return f;
}

function binary(op, a, b) {
  switch (op) {
    case "Add":
      return a + b;
    case "Sub":
      return a - b;
    case "Mul":
      return a * b;
    case "Div":
      return a / b;
    case "Rem":
      return a % b;
    case "Exp":
      return a ** b;
    case "Eq":
      return a == b;
    case "Ne":
      return a != b;
    case "StrictEq":
      return a === b;
    case "StrictNe":
      return a !== b;
    case "Lt":
      return a < b;
    case "Le":
      return a <= b;
    case "Gt":
      return a > b;
    case "Ge":
      return a >= b;
    case "BitAnd":
      return a & b;
    case "BitOr":
      return a | b;
    case "BitXor":
      return a ^ b;
    case "Shl":
      return a << b;
    case "Shr":
      return a >> b;
    case "UShr":
      return a >>> b;
  }
  throw new Refused(`\`${op}\` is not an operator of a shell`);
}

function unary(op, value) {
  switch (op) {
    case "Neg":
      return -value;
    case "Plus":
      return +value;
    case "Not":
      return !value;
    case "BitNot":
      return ~value;
    case "Typeof":
      return typeof value;
  }
  throw new Refused(`\`${op}\` is not an operator of a shell`);
}

// A program as the page runs it: each op its name and its fields, and the
// constants as values.
function decoded(tier1) {
  return {
    registers: tier1.registers,
    consts: tier1.consts.map(constant),
    names: tier1.names,
    code: tier1.code.map((op) => {
      const [[name, fields]] = Object.entries(op);
      return { kind: name, ...fields };
    }),
  };
}

// Runs `program` with `scope` as its object, `params` its parameters and
// `args` the signal's arguments. `shell` knows the shell's blocks.
function run(program, scope, params, args, shell) {
  const { code, consts, names } = program;
  const regs = new Array(program.registers);
  let steps = 0;
  let pc = 0;
  while (pc < code.length) {
    if (++steps > BUDGET) throw new Runaway();
    const at = code[pc++];
    switch (at.kind) {
      case "Const":
        regs[at.dst] = consts[at.k];
        break;
      case "Move":
        regs[at.dst] = regs[at.src];
        break;
      case "Pass":
        if (regs[at.reg] === 0) regs[at.reg] = 0;
        break;
      case "Param":
        regs[at.dst] = params[at.param];
        break;
      case "Local":
        regs[at.dst] = args[at.index];
        break;
      case "This":
        regs[at.dst] = scope;
        break;
      case "Get": {
        let value = regs[at.obj];
        for (let index = 0; index < at.len; index++) value = read(value, names[at.path + index]);
        regs[at.dst] = value;
        break;
      }
      case "Index": {
        const object = regs[at.obj];
        const index = regs[at.index];
        if (!(Array.isArray(object) || typeof object === "string") || !Number.isInteger(index)) {
          throw new Refused("a shell indexes only a list or a string, by a whole number");
        }
        regs[at.dst] = readable(object[index]);
        break;
      }
      case "EnumKey": {
        const Type = params[at.param];
        const value = Type?.enums?.[names[at.key]];
        regs[at.dst] = typeof value === "number" ? value : undefined;
        break;
      }
      case "QtKey": {
        const value = Qt[names[at.key]];
        regs[at.dst] = typeof value === "number" ? value : undefined;
        break;
      }
      case "Binary":
        regs[at.dst] = binary(at.op, regs[at.a], regs[at.b]);
        break;
      case "Unary":
        regs[at.dst] = unary(at.op, regs[at.src]);
        break;
      case "Jump":
        pc = at.to;
        break;
      case "JumpIf":
        if (regs[at.cond]) pc = at.to;
        break;
      case "JumpIfNot":
        if (!regs[at.cond]) pc = at.to;
        break;
      case "JumpIfNullish":
        if (regs[at.src] == null) pc = at.to;
        break;
      case "Concat":
        regs[at.dst] = regs
          .slice(at.base, at.base + at.count)
          .map(String)
          .join("");
        break;
      case "Array":
        regs[at.dst] = regs.slice(at.base, at.base + at.count);
        break;
      case "Check":
        if (!(RECEIVERS[at.f] ?? (() => false))(regs[at.src])) throw new TypeError(`not a value \`${at.f}\` is a method of`);
        break;
      case "Call":
        regs[at.dst] = readable(builtin(at.f)(...regs.slice(at.base, at.base + at.count)));
        break;
      case "Target": {
        const owner = regs[at.obj];
        const name = names[at.name];
        const grouped = !!owner?.$type?.groups?.[name];
        regs[at.grouped] = grouped;
        regs[at.dst] = grouped ? owner : read(owner, name);
        break;
      }
      case "Set": {
        const target = regs[at.obj];
        const name = names[at.name];
        const group = at.group && regs[at.group[0]] ? names[at.group[1]] : null;
        const key = group ? `${group}$${name}` : name;
        if (forbidden(name) || (group && forbidden(group)) || !shell.objects.has(target) || !written(target, key)) {
          throw new Refused(`\`${key.replaceAll("$", ".")}\` is not a property a shell writes`);
        }
        if (group) target[group][name] = regs[at.val];
        else target[name] = regs[at.val];
        break;
      }
      case "Invoke": {
        const target = regs[at.obj];
        const name = names[at.name];
        if (!shell.actions.get(target)?.has(name)) throw new Refused(`\`${name}\` is not an action of a block the shell names`);
        regs[at.dst] = readable(target[name](...regs.slice(at.base, at.base + at.count)));
        break;
      }
      case "Return":
        return regs[at.src];
      default:
        throw new Refused(`\`${at.kind}\` is not run in a shell`);
    }
  }
  return undefined;
}

// `Shell.qml:4:15: …`, warned as a binding's error is.
function warn(file, binding, what, error) {
  const { line, column } = binding.span;
  const why = error instanceof Runaway ? `${what} ran past its budget of ${BUDGET} steps and was stopped` : `${what}: ${error?.message ?? error}`;
  console.warn(`${file}:${line}:${column}: ${why}`);
}

const cap = (name) => name[0].toUpperCase() + name.slice(1);

const DECLARED = { int: $int, real: $real, double: $real, bool: $bool, string: $string, color: $color };

// The component a compiled shell is: called, it makes the shell's objects,
// its blocks those of `blocks` (`{ "Shop/Basket": Held }`).
export function shellOf(compiled, blocks, file = "Shell.qml") {
  const [component] = compiled.components;
  const defs = component.objects;
  const programs = compiled.exprs.map((expr) => ({ expr, program: decoded(expr.tier1) }));
  const types = defs.map(({ ty }) => {
    const { module, name } = ty.Native;
    if (module === "QtQuick") return { Type: quick(name) };
    const block = blocks[`${module}/${name}`];
    if (!block) throw new Refused(`${name} is not a block of the page`);
    return { Type: block.component, actions: new Set(block.actions.map((action) => action.name)) };
  });

  function Shell(given) {
    const objects = defs.map((def) => $object(def.id ?? undefined));
    const shell = { objects: new Set(objects), actions: new Map() };
    types.forEach(({ actions }, index) => actions && shell.actions.set(objects[index], actions));

    const params = (expr) =>
      expr.params.map(({ arg }) => {
        if (arg.Object) return objects[arg.Object.object];
        if (arg.Type?.Native?.module === "QtQuick") return quick(arg.Type.Native.name);
        throw new Refused("a parameter a shell does not have");
      });

    const binding = (props, key, index, what) => {
      const { expr, program } = programs[index];
      const scope = objects[expr.scope.object];
      let given;
      let last;
      const get = () => {
        given ??= params(expr);
        try {
          return (last = run(program, scope, given, [], shell));
        } catch (error) {
          warn(file, expr, what, error);
          return last;
        }
      };
      // What a reload compares to tell whether the binding is the same.
      Object.defineProperty(get, "toString", { value: () => `shell:${expr.hash}` });
      Object.defineProperty(props, key, { get, enumerable: true, configurable: true });
    };

    const handler = (index, what) => {
      const { expr, program } = programs[index];
      const scope = objects[expr.scope.object];
      let given;
      return (...args) => {
        given ??= params(expr);
        try {
          run(program, scope, given, args, shell);
        } catch (error) {
          warn(file, expr, what, error);
        }
      };
    };

    const members = (props, members, prefix) => {
      for (const { name, value } of members.assignments) props[prefix + name] = literal(value);
      for (const { name, expr } of members.bindings) binding(props, prefix + name, expr, `the binding of ${(prefix + name).replaceAll("$", ".")}`);
      for (const { signal, expr } of members.handlers) props[`on${cap(signal)}`] = handler(expr, `on${cap(signal)}`);
    };

    const make = (index) => {
      const def = defs[index];
      const { Type } = types[index];
      const props = { $self: objects[index] };
      if (index === 0) props.$given = given;
      members(props, def.members, "");
      for (const group of def.grouped) members(props, group.members, `${group.path.join("$")}$`);
      // An attached group does nothing until its type is attached:
      // compiled QML says so in its `$attach` list, and a shell's
      // `Accessible.*` values are in the props the same way.
      if (def.grouped.some((group) => group.path[0] === "Accessible")) props.$attach = [quick("Accessible")];
      if (def.properties.length > 0) {
        props.$declare = { properties: Object.fromEntries(def.properties.map(({ name, ty }) => [name, DECLARED[ty]])) };
      }
      // Rich text loads what an `<img>` in it names.
      if (Type === Quick.Text) props.textFormat = Quick.Text.PlainText;
      if (def.children.length > 0) {
        Object.defineProperty(props, "children", {
          get: () => def.children.map((child) => make(child.Object)),
          enumerable: true,
          configurable: true,
        });
      }
      return createComponent(Type, props);
    };
    return make(0);
  }
  Object.setPrototypeOf(Shell, types[0].Type);
  return Shell;
}
