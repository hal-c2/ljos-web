// What a scene's own shaders are written in, made what a browser takes.
//
// Qt has such a shader written in the language of OpenGL 4.4, and a browser
// has the one of OpenGL ES 3.0, which is the same but for what it leaves
// out. Three things it leaves out are in every other shader written for
// Qt: a whole number standing where a fraction is meant (`x * 2`,
// `pow(x, 2)`, `float f = 0;`), a variable outside any function begun with
// something worked out (`float r2 = roughness * roughness;`), and a line
// saying how exact numbers are, which here is said once for all.
//
// So a shader is read here as far as knowing what kind of number every
// expression in it is. A whole number where a fraction is wanted is made
// one, a variable begun with something worked out is begun when the shader
// starts, and what is said under `#if` is kept or dropped by what is true
// here.
//
// What is read is what such shaders are written with, and not the whole of
// the language: what is not understood is left as it is, for the browser to
// say what it makes of it.

export const TYPES = new Set(
  (
    "void bool int uint float vec2 vec3 vec4 ivec2 ivec3 ivec4 uvec2 uvec3 uvec4 bvec2 bvec3 bvec4 " +
    "mat2 mat3 mat4 mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4 " +
    "sampler2D sampler3D samplerCube sampler2DShadow samplerCubeShadow sampler2DArray sampler2DArrayShadow " +
    "isampler2D isampler3D isamplerCube isampler2DArray usampler2D usampler3D usamplerCube usampler2DArray"
  ).split(" "),
);

const QUALIFIERS = new Set("const in out inout uniform highp mediump lowp flat smooth centroid invariant precise attribute varying layout".split(" "));

const WORDS = new Set("struct precision if else for while do return break continue discard switch case default true false location main".split(" "));

// The functions the language has of its own.
export const FUNCTIONS = new Set(
  (
    "radians degrees sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh pow exp log exp2 log2 sqrt inversesqrt " +
    "abs sign floor trunc round roundEven ceil fract mod modf min max clamp mix step smoothstep isnan isinf " +
    "floatBitsToInt floatBitsToUint intBitsToFloat uintBitsToFloat length distance dot cross normalize faceforward reflect refract " +
    "matrixCompMult outerProduct transpose determinant inverse lessThan lessThanEqual greaterThan greaterThanEqual equal notEqual " +
    "any all not textureSize texture textureProj textureLod textureOffset texelFetch texelFetchOffset textureProjOffset " +
    "textureLodOffset textureProjLod textureProjLodOffset textureGrad textureGradOffset textureProjGrad textureProjGradOffset " +
    "dFdx dFdy fwidth packSnorm2x16 unpackSnorm2x16 packUnorm2x16 unpackUnorm2x16 packHalf2x16 unpackHalf2x16"
  ).split(" "),
);

const FLOATS = ["float", "vec2", "vec3", "vec4"];
const INTS = ["int", "ivec2", "ivec3", "ivec4"];
const UINTS = ["uint", "uvec2", "uvec3", "uvec4"];
const BOOLS = ["bool", "bvec2", "bvec3", "bvec4"];
const FAMILIES = [FLOATS, INTS, UINTS, BOOLS];
const MATRIX = /^mat([234])(?:x([234]))?$/;

const family = (type) => FAMILIES.find((kinds) => kinds.includes(type)) ?? null;
// How many numbers a number or a vector is: none for anything else.
const size = (type) => (family(type)?.indexOf(type) ?? -1) + 1;
const fraction = (type) => FLOATS.includes(type) || MATRIX.test(type ?? "");
const whole = (type) => INTS.includes(type) || UINTS.includes(type);

const PATTERN =
  /(\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(#[^\n]*)|([A-Za-z_]\w*)|((?:0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)(?:[uUfF]|lf|LF)?)|(<<=|>>=|\+\+|--|<<|>>|<=|>=|==|!=|&&|\|\||\^\^|[-+*/%&|^]=|[\s\S])/y;

// A shader as its words, with what is between them kept.
export function words(source) {
  const found = [];
  PATTERN.lastIndex = 0;
  for (let match; (match = PATTERN.exec(source)); ) {
    const kind = match[1] !== undefined ? "space" : match[2] !== undefined ? "line" : match[3] !== undefined ? "name" : match[4] !== undefined ? "number" : "mark";
    found.push({ kind, text: match[0] });
  }
  return found;
}

// A sum of whole numbers after `#if`, with what it names already numbers.
function reckoned(text) {
  const marks = text.match(/\d+|\|\||&&|[<>=!]=|[-+*/%<>!()]/g) ?? [];
  let at = 0;
  const RANKS = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, ">": 4, "<=": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6 };
  const SUMS = {
    "||": (a, b) => (a || b ? 1 : 0),
    "&&": (a, b) => (a && b ? 1 : 0),
    "==": (a, b) => (a === b ? 1 : 0),
    "!=": (a, b) => (a !== b ? 1 : 0),
    "<": (a, b) => (a < b ? 1 : 0),
    ">": (a, b) => (a > b ? 1 : 0),
    "<=": (a, b) => (a <= b ? 1 : 0),
    ">=": (a, b) => (a >= b ? 1 : 0),
    "+": (a, b) => a + b,
    "-": (a, b) => a - b,
    "*": (a, b) => a * b,
    "/": (a, b) => (b ? Math.trunc(a / b) : 0),
    "%": (a, b) => (b ? a % b : 0),
  };
  const one = () => {
    const mark = marks[at++];
    if (mark === "!") return one() ? 0 : 1;
    if (mark === "-") return -one();
    if (mark === "+") return one();
    if (mark === "(") {
      const value = sum(1);
      at++;
      return value;
    }
    return Number(mark) || 0;
  };
  const sum = (least) => {
    let left = one();
    while (RANKS[marks[at]] >= least) {
      const mark = marks[at++];
      left = SUMS[mark](left, sum(RANKS[mark] + 1));
    }
    return left;
  };
  return sum(1);
}

// What is passed to a macro, where a `(` comes next in what is still to be
// read (last word first): each argument's words, and how much is left after.
function passed(stack) {
  let at = stack.length - 1;
  while (at >= 0 && stack[at].kind === "space") at--;
  if (stack[at]?.text !== "(") return null;
  const parts = [[]];
  for (let depth = 1, next = at - 1; next >= 0; next--) {
    const { text } = stack[next];
    if (text === "(") depth++;
    else if (text === ")" && --depth === 0) return { parts, left: next };
    if (text === "," && depth === 1) parts.push([]);
    else parts.at(-1).push(stack[next]);
  }
  return null;
}

// A macro's body with its parameters put for what they were passed. Words are
// joined where it says `##`, as OpenGL 4.4 has that and OpenGL ES does not.
function filled(body, given) {
  return body
    .split(/\s*##\s*/)
    .map((part) => words(part).map((word) => (word.kind === "name" ? given.get(word.text) : null) ?? word.text).join(""))
    .join("");
}

// A shader with each macro put for what it says, from where it is said to
// where it stops being so. Nothing that `ordered` or `Reader` does to code is
// then out of its reach in a macro. A macro is not put for itself, as the
// words it comes to are not read again for it; one passed the wrong number of
// arguments is left, for the browser to report.
function expanded(stack, macros) {
  let text = "";
  while (stack.length) {
    const word = stack.pop();
    if (word.kind === "line") {
      const said = /^#\s*(define|undef)\s+(\w+)(\(?)(.*)$/.exec(word.text.replace(/\/\/.*/, ""));
      if (!said) text += word.text;
      else if (said[1] === "undef") macros.delete(said[2]);
      else if (!said[3]) macros.set(said[2], { body: said[4].trim() });
      else {
        const close = said[4].indexOf(")");
        const params = said[4].slice(0, close).split(",").map((param) => param.trim()).filter(Boolean);
        macros.set(said[2], { params, body: said[4].slice(close + 1).trim() });
      }
      continue;
    }
    const macro = word.kind === "name" && !word.from?.has(word.text) ? macros.get(word.text) : null;
    if (!macro) {
      text += word.text;
      continue;
    }
    let given = new Map();
    if (macro.params) {
      const call = passed(stack);
      const empty = macro.params.length === 0 && call?.parts.length === 1 && call.parts[0].every((part) => part.kind === "space");
      if (!call || (call.parts.length !== macro.params.length && !empty)) {
        text += word.text;
        continue;
      }
      stack.length = call.left;
      given = new Map(macro.params.map((param, index) => [param, expanded([...call.parts[index]].reverse(), macros).trim()]));
    }
    // Spaces around it, as `1 -NEGATIVE` is not to come to `1 --1`.
    const from = new Set(word.from).add(word.text);
    stack.push(...words(` ${filled(macro.body, given)} `).map((one) => ({ ...one, from })).reverse());
  }
  return text;
}

// A shader with what is under `#if` kept where it holds and dropped where it
// does not, and with what `#define` says put for each macro. What is written
// about a shader in it says nothing: a `#define` in a comment of several lines
// is of the comment.
export function conditioned(source, given = {}) {
  const values = new Map(Object.entries(given).map(([name, value]) => [name, String(value)]));
  const holds = (text) => {
    let sum = text.replace(/\/\/.*|\/\*.*?\*\//g, "").replace(/defined\s*\(?\s*(\w+)\s*\)?/g, (_, name) => (values.has(name) ? "1" : "0"));
    for (let round = 0; round < 8; round++) sum = sum.replace(/[A-Za-z_]\w*/g, (name) => values.get(name) ?? "0");
    return reckoned(sum) !== 0;
  };
  // Of each `#if` there is: whether what is under it now is kept, whether
  // any of it has been, and whether what it is in is.
  const open = [];
  const kept = () => open.every((level) => level.now);
  const lines = [];
  // A comment is left out, its lines kept: an error says which line.
  const bare = source.replace(/\/\/.*|\/\*[^]*?\*\//g, (all) => (all.startsWith("//") ? all : all.replace(/[^\n]/g, "")));
  for (const line of bare.replace(/\\\r?\n/g, "").split("\n")) {
    const said = /^\s*#\s*(\w+)\s*(.*?)\s*$/.exec(line);
    if (!said) {
      lines.push(kept() ? line : "");
      continue;
    }
    const [, word, rest] = said;
    let out = "";
    if (word === "if" || word === "ifdef" || word === "ifndef") {
      const now = kept() && (word === "if" ? holds(rest) : values.has(rest.split(/\s/)[0]) === (word === "ifdef"));
      open.push({ now, any: now, above: kept() });
    } else if (word === "elif" || word === "else") {
      const level = open[open.length - 1];
      if (level) {
        level.now = level.above && !level.any && (word === "else" || holds(rest));
        level.any ||= level.now;
      }
    } else if (word === "endif") open.pop();
    else if (!kept()) out = "";
    else if (word === "define") {
      const [, name, takes, value] = /^(\w+)(\(?)\s*(.*)$/.exec(rest) ?? [];
      // Whatever takes arguments has no value for an `#if` to read, and is defined.
      if (name) values.set(name, takes ? "0" : value.replace(/\/\/.*|\/\*.*?\*\//g, "").trim());
      out = line.trim();
    } else if (word === "undef") {
      values.delete(rest);
      out = line.trim();
    }
    lines.push(out);
  }
  const macros = new Map(Object.entries(given).map(([name, value]) => [name, { body: String(value) }]));
  return expanded(words(lines.join("\n")).reverse(), macros);
}

// A shader's own names, each with `qt_` before it: what the language has
// of its own is left, and what is asked of a value after a dot. This is how
// the shaders here are kept out of the way of the names a scene's shader
// has, which may be any.
export function prefixed(source) {
  let last = "";
  return words(source)
    .map((word) => {
      const { kind, text } = word;
      if (kind === "space") return text;
      const own = kind === "name" && last !== "." && !TYPES.has(text) && !QUALIFIERS.has(text) && !WORDS.has(text) && !FUNCTIONS.has(text) && !text.startsWith("gl_");
      last = text;
      return own ? `qt_${text}` : text;
    })
    .join("");
}

// What a function of the language gives back, by what it is handed: and
// what it is handed made fractions where it takes nothing else.
const every = (args) => (args.some((arg) => !arg.type) ? null : args.reduce((best, arg) => (size(arg.type) > size(best) ? arg.type : best), null));
const fractions = (result) => (reader, args) => {
  for (const arg of args) reader.fit(arg, "float");
  return result(args);
};
// Those that take whole numbers as well take fractions where any of what
// they are handed is one.
const either = (reader, args) => {
  if (args.some((arg) => fraction(arg.type))) for (const arg of args) reader.fit(arg, "float");
  return every(args);
};
const sampled = (type) => (!type ? null : /Shadow$/.test(type) ? "float" : type.startsWith("isampler") ? "ivec4" : type.startsWith("usampler") ? "uvec4" : type.startsWith("sampler") ? "vec4" : null);
const read = (reader, args) => {
  for (const arg of args.slice(1)) reader.fit(arg, "float");
  return sampled(args[0]?.type);
};
const compared = (reader, args) => {
  either(reader, args);
  return BOOLS[size(args[0]?.type) - 1] ?? null;
};

const RULES = {
  length: fractions(() => "float"),
  distance: fractions(() => "float"),
  dot: fractions(() => "float"),
  determinant: () => "float",
  cross: fractions(() => "vec3"),
  transpose: (reader, args) => args[0]?.type ?? null,
  inverse: (reader, args) => args[0]?.type ?? null,
  matrixCompMult: (reader, args) => args[0]?.type ?? null,
  not: (reader, args) => args[0]?.type ?? null,
  any: () => "bool",
  all: () => "bool",
  isnan: (reader, args) => BOOLS[size(args[0]?.type) - 1] ?? null,
  isinf: (reader, args) => BOOLS[size(args[0]?.type) - 1] ?? null,
  floatBitsToInt: (reader, args) => INTS[size(args[0]?.type) - 1] ?? null,
  floatBitsToUint: (reader, args) => UINTS[size(args[0]?.type) - 1] ?? null,
  intBitsToFloat: (reader, args) => FLOATS[size(args[0]?.type) - 1] ?? null,
  uintBitsToFloat: (reader, args) => FLOATS[size(args[0]?.type) - 1] ?? null,
  texture: read,
  textureLod: read,
  textureProj: read,
  textureGrad: read,
  textureProjLod: read,
  textureOffset: (reader, args) => sampled(args[0]?.type),
  texelFetch: (reader, args) => sampled(args[0]?.type),
  texelFetchOffset: (reader, args) => sampled(args[0]?.type),
  textureSize: (reader, args) => (/3D|Array/.test(args[0]?.type ?? "") ? "ivec3" : "ivec2"),
};
for (const name of "radians degrees sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh pow exp log exp2 log2 sqrt inversesqrt floor trunc round roundEven ceil fract mod mix step smoothstep normalize faceforward reflect refract dFdx dFdy fwidth".split(" "))
  RULES[name] = fractions(every);
for (const name of ["abs", "sign", "min", "max", "clamp"]) RULES[name] = either;
for (const name of ["lessThan", "lessThanEqual", "greaterThan", "greaterThanEqual", "equal", "notEqual"]) RULES[name] = compared;

const GIVEN = { gl_FragCoord: "vec4", gl_Position: "vec4", gl_PointSize: "float", gl_FrontFacing: "bool", gl_VertexID: "int", gl_InstanceID: "int", gl_FragDepth: "float", gl_PointCoord: "vec2" };

// How tightly each mark between two values binds them.
const RANKS = { "||": 1, "^^": 2, "&&": 3, "|": 4, "^": 5, "&": 6, "==": 7, "!=": 7, "<": 8, ">": 8, "<=": 8, ">=": 8, "<<": 9, ">>": 9, "+": 10, "-": 10, "*": 11, "/": 11, "%": 11 };
const ASSIGNS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "<<=", ">>=", "&=", "^=", "|="]);
const END = { kind: "end", text: "" };

// What two values make, joined by a mark of arithmetic.
function made(mark, left, right) {
  if (!left || !right) return null;
  const [a, b] = [MATRIX.exec(left), MATRIX.exec(right)];
  if (a && b) return left === right ? left : null;
  if (a) return size(right) > 1 && mark === "*" ? `vec${a[2] ?? a[1]}` : left;
  if (b) return size(left) > 1 && mark === "*" ? `vec${b[1]}` : right;
  return size(right) > size(left) ? right : left;
}

// Reads shaders, one after another: what the first declare, the later ones
// may name.
export class Reader {
  constructor() {
    this.scopes = [new Map(Object.entries(GIVEN))];
    this.functions = new Map();
    this.structs = new Map();
  }

  // Another that knows what this one has read, for a shader of its own.
  fork() {
    const other = new Reader();
    other.scopes = [new Map(this.scopes[0])];
    other.functions = new Map([...this.functions].map(([name, known]) => [name, [...known]]));
    other.structs = new Map(this.structs);
    return other;
  }

  // Takes in what a shader declares, which is one that needs nothing done
  // to it.
  declare(source) {
    this.read(source, false);
  }

  // A shader fitted for a browser: its text, and what its variables outside
  // any function are begun with, which is to be done when it starts.
  fitted(source) {
    return this.read(source, true);
  }

  read(source, fixing) {
    this.all = words(source);
    this.code = [];
    this.all.forEach((word, index) => {
      if (word.kind !== "space" && word.kind !== "line") this.code.push(index);
    });
    this.at = 0;
    this.fixing = fixing;
    this.before = [];
    this.after = [];
    this.moved = [];
    this.begun = [];
    while (this.at < this.code.length) {
      const from = this.at;
      try {
        this.outside();
      } catch {
        // Not understood: on to what is after it, which is left as it is.
        this.scopes.length = 1;
        this.at = from;
        this.past();
      }
    }
    if (!fixing) return null;
    const hidden = new Set();
    for (const [from, to] of this.moved) for (let index = from; index <= to; index++) hidden.add(index);
    const text = this.all.map((word, index) => (hidden.has(index) ? "" : this.shown(index))).join("");
    return { text, begun: this.begun.map(({ name, from, to }) => `${name} = ${this.text(from, to)};`) };
  }

  shown(index) {
    return (this.before[index] ?? "") + this.all[index].text + (this.after[index] ?? "");
  }

  text(from, to) {
    let text = "";
    for (let index = from; index <= to; index++) text += this.shown(index);
    return text;
  }

  // Past one thing outside any function, whatever it is: to the `;` that
  // ends it, or the `}` that does.
  past() {
    let depth = 0;
    while (this.at < this.code.length) {
      const { text } = this.next();
      if (text === "{") depth++;
      else if (text === "}" && --depth <= 0) {
        this.take(";");
        return;
      } else if (text === ";" && depth === 0) return;
    }
  }

  peek(ahead = 0) {
    return this.all[this.code[this.at + ahead]] ?? END;
  }

  // Where the word now read is among all of them.
  here() {
    return this.code[this.at] ?? this.all.length - 1;
  }

  next() {
    const word = this.peek();
    if (word === END) throw new Error("ended");
    this.at++;
    return word;
  }

  is(text) {
    return this.peek().text === text;
  }

  take(text) {
    if (!this.is(text)) return false;
    this.at++;
    return true;
  }

  // Past a word that must be there, saying where it was.
  expect(text) {
    const index = this.here();
    if (!this.take(text)) throw new Error(`no ${text}`);
    return index;
  }

  // Past what is between a bracket and the one that closes it.
  closed(opens, closes) {
    this.expect(opens);
    for (let depth = 1; depth > 0; ) {
      const { text } = this.next();
      if (text === opens) depth++;
      else if (text === closes) depth--;
    }
    return this.code[this.at - 1];
  }

  typed(text) {
    return TYPES.has(text) || this.structs.has(text);
  }

  lookup(name) {
    for (let index = this.scopes.length - 1; index >= 0; index--) {
      const type = this.scopes[index].get(name);
      if (type !== undefined) return type;
    }
    return null;
  }

  // Makes a value the kind that is wanted, where it is a whole number and
  // a fraction is, or one with a sign where one without is. A number
  // written out is written as the other kind; anything else is handed to
  // what makes one of it.
  fit(node, wanted) {
    if (!this.fixing || !node?.type || !wanted || node.type === wanted) return;
    const have = node.type;
    let to = null;
    if (whole(have) && fraction(wanted)) to = FLOATS[size(have) - 1];
    else if (INTS.includes(have) && UINTS.includes(wanted)) to = UINTS[size(have) - 1];
    if (!to) return;
    if (node.written) {
      for (const index of node.written) {
        const word = this.all[index];
        word.text = to === "float" ? `${word.text.replace(/[uU]$/, "")}.0` : `${word.text}u`;
      }
    } else {
      this.before[node.from] = `${to}(${this.before[node.from] ?? ""}`;
      this.after[node.to] = `${this.after[node.to] ?? ""})`;
    }
    node.type = to;
    node.written = null;
  }

  // Two values on either side of a mark, each made what the other is.
  matched(left, right) {
    if (fraction(left.type) && whole(right.type)) this.fit(right, left.type);
    else if (whole(left.type) && fraction(right.type)) this.fit(left, right.type);
    else if (UINTS.includes(left.type) && INTS.includes(right.type)) this.fit(right, left.type);
    else if (INTS.includes(left.type) && UINTS.includes(right.type)) this.fit(left, right.type);
  }

  qualifiers() {
    const found = new Set();
    while (this.peek().kind === "name" && QUALIFIERS.has(this.peek().text)) {
      const { text } = this.next();
      found.add(text);
      if (text === "layout") this.closed("(", ")");
    }
    return found;
  }

  // The kind something is declared as: one the language has, or a struct,
  // which may be said here in full.
  kind() {
    let type;
    if (this.take("struct")) {
      type = this.peek().kind === "name" && !this.is("{") ? this.next().text : "";
      if (this.is("{")) {
        const fields = new Map();
        this.next();
        while (!this.take("}")) {
          this.qualifiers();
          const of = this.kind();
          do {
            const name = this.next().text;
            fields.set(name, this.is("[") ? `${of}[]` : of);
            while (this.is("[")) this.closed("[", "]");
          } while (this.take(","));
          this.expect(";");
        }
        this.structs.set(type, fields);
      }
    } else {
      const word = this.next();
      if (word.kind !== "name") throw new Error("no type");
      type = this.typed(word.text) ? word.text : null;
    }
    while (this.is("[")) {
      this.closed("[", "]");
      type = type && `${type}[]`;
    }
    return type;
  }

  // One thing outside any function: a function, or variables.
  outside() {
    if (this.take(";")) return;
    if (this.is("precision")) return this.unsaid();
    const said = this.qualifiers();
    if (this.take(";")) return;
    const type = this.kind();
    if (this.take(";")) return;
    const name = this.next();
    if (name.kind !== "name") throw new Error("no name");
    if (this.is("(")) return this.function(type, name.text);
    // A block of uniforms is not something these shaders have.
    if (this.is("{")) throw new Error("block");
    this.variables(type, name.text, { outside: !said.has("const") && !said.has("uniform") && !said.has("in") && !said.has("out") });
  }

  // How exact numbers are is said once, by the shader this one is put in.
  unsaid() {
    const from = this.here();
    while (!this.take(";")) this.next();
    if (this.fixing) this.moved.push([from, this.code[this.at - 1]]);
  }

  variables(type, name, { outside = false } = {}) {
    for (;;) {
      let own = type;
      while (this.is("[")) {
        this.closed("[", "]");
        own = own && !own.endsWith("[]") ? `${own}[]` : own;
      }
      this.scopes[this.scopes.length - 1].set(name, own);
      if (this.is("=")) {
        const from = this.here();
        this.next();
        if (this.is("{")) this.closed("{", "}");
        else {
          const value = this.assignment();
          this.fit(value, own);
          if (outside && this.fixing) {
            this.moved.push([from, value.to]);
            this.begun.push({ name, from: value.from, to: value.to });
          }
        }
      }
      if (!this.take(",")) break;
      name = this.next().text;
    }
    this.expect(";");
  }

  function(returns, name) {
    this.expect("(");
    const takes = [];
    this.scopes.push(new Map());
    if (this.is("void") && this.peek(1).text === ")") this.next();
    while (!this.is(")")) {
      const said = this.qualifiers();
      let type = this.kind();
      if (this.peek().kind === "name") {
        const called = this.next().text;
        while (this.is("[")) {
          this.closed("[", "]");
          type = type && `${type}[]`;
        }
        this.scopes[this.scopes.length - 1].set(called, type);
      }
      takes.push({ type, way: said.has("out") ? "out" : said.has("inout") ? "inout" : "in" });
      if (!this.take(",")) break;
    }
    this.expect(")");
    const known = this.functions.get(name) ?? [];
    this.functions.set(name, known);
    if (!known.some((other) => other.takes.length === takes.length && other.takes.every((taken, index) => taken.type === takes[index].type))) known.push({ returns, takes });
    if (!this.take(";")) {
      this.returns = returns;
      this.block();
    }
    this.scopes.pop();
  }

  block() {
    this.expect("{");
    this.scopes.push(new Map());
    while (!this.take("}")) this.statement();
    this.scopes.pop();
  }

  statement() {
    const word = this.peek();
    if (word.text === "{") return this.block();
    if (this.take(";")) return;
    if (word.kind === "name") {
      switch (word.text) {
        case "if":
          this.next();
          this.expect("(");
          this.expression();
          this.expect(")");
          this.statement();
          if (this.take("else")) this.statement();
          return;
        case "for":
          this.next();
          this.expect("(");
          this.scopes.push(new Map());
          if (!this.take(";")) this.plain();
          if (!this.is(";")) this.expression();
          this.expect(";");
          if (!this.is(")")) this.expression();
          this.expect(")");
          this.statement();
          this.scopes.pop();
          return;
        case "while":
        case "switch":
          this.next();
          this.expect("(");
          this.expression();
          this.expect(")");
          this.statement();
          return;
        case "do":
          this.next();
          this.statement();
          this.expect("while");
          this.expect("(");
          this.expression();
          this.expect(")");
          this.expect(";");
          return;
        case "return":
          this.next();
          if (!this.is(";")) this.fit(this.expression(), this.returns);
          this.expect(";");
          return;
        case "break":
        case "continue":
        case "discard":
          this.next();
          this.expect(";");
          return;
        case "case":
          this.next();
          this.ternary();
          this.expect(":");
          return;
        case "default":
          this.next();
          this.expect(":");
          return;
        case "precision":
          return this.unsaid();
      }
    }
    this.plain();
  }

  // Variables, or something to be worked out, with the `;` after.
  plain() {
    const word = this.peek();
    let declares = word.kind === "name" && (QUALIFIERS.has(word.text) || word.text === "struct");
    if (!declares && word.kind === "name" && this.typed(word.text)) {
      let ahead = 1;
      if (this.peek(ahead).text === "[") {
        while (this.peek(ahead).text !== "]" && this.peek(ahead) !== END) ahead++;
        ahead++;
      }
      declares = this.peek(ahead).kind === "name";
    }
    if (!declares) {
      this.expression();
      this.expect(";");
      return;
    }
    this.qualifiers();
    const type = this.kind();
    if (this.take(";")) return;
    this.variables(type, this.next().text);
  }

  expression() {
    let node = this.assignment();
    while (this.take(",")) {
      const last = this.assignment();
      node = { type: last.type, from: node.from, to: last.to };
    }
    return node;
  }

  assignment() {
    const left = this.ternary();
    const mark = this.peek();
    if (mark.kind !== "mark" || !ASSIGNS.has(mark.text)) return left;
    this.next();
    const right = this.assignment();
    if (mark.text === "=") this.fit(right, left.type);
    else if (["+=", "-=", "*=", "/="].includes(mark.text) && (fraction(left.type) || UINTS.includes(left.type))) this.fit(right, left.type);
    return { type: left.type, from: left.from, to: right.to };
  }

  ternary() {
    const whether = this.binary(1);
    if (!this.take("?")) return whether;
    const yes = this.expression();
    this.expect(":");
    const no = this.assignment();
    this.matched(yes, no);
    return { type: yes.type ?? no.type, from: whether.from, to: no.to };
  }

  binary(least) {
    let left = this.unary();
    for (;;) {
      const mark = this.peek();
      const rank = mark.kind === "mark" ? RANKS[mark.text] : undefined;
      if (!rank || rank < least) return left;
      this.next();
      const right = this.binary(rank + 1);
      let type;
      if (rank <= 3) type = "bool";
      else if (rank === 7 || rank === 8) {
        this.matched(left, right);
        type = "bool";
      } else if (rank < 10 || mark.text === "%") type = size(right.type) > size(left.type) ? right.type : left.type;
      else {
        this.matched(left, right);
        type = made(mark.text, left.type, right.type);
      }
      left = { type, from: left.from, to: right.to };
    }
  }

  unary() {
    const mark = this.peek();
    if (mark.kind === "mark" && ["-", "+", "!", "~", "++", "--"].includes(mark.text)) {
      const from = this.here();
      this.next();
      const inner = this.unary();
      return { type: inner.type, from, to: inner.to, written: mark.text === "-" || mark.text === "+" ? inner.written : null };
    }
    let node = this.first();
    for (;;) {
      if (this.is("[")) {
        this.next();
        this.expression();
        const to = this.expect("]");
        const of = node.type;
        const matrix = MATRIX.exec(of ?? "");
        node = { type: !of ? null : of.endsWith("[]") ? of.slice(0, -2) : matrix ? `vec${matrix[2] ?? matrix[1]}` : (family(of)?.[0] ?? null), from: node.from, to };
      } else if (this.is(".")) {
        this.next();
        const to = this.here();
        const name = this.next().text;
        if (this.is("(")) {
          // `.length()`, which is all there is to call on a value.
          node = { type: "int", from: node.from, to: this.closed("(", ")") };
          continue;
        }
        const fields = this.structs.get(node.type);
        const kinds = family(node.type);
        node = { type: fields ? (fields.get(name) ?? null) : kinds && /^[xyzwrgbastpq]{1,4}$/.test(name) ? kinds[name.length - 1] : null, from: node.from, to };
      } else if (this.is("++") || this.is("--")) {
        node = { type: node.type, from: node.from, to: this.here() };
        this.next();
      } else return node;
    }
  }

  // What is handed to a function, each a value of its own.
  handed() {
    this.expect("(");
    const args = [];
    if (this.is("void") && this.peek(1).text === ")") this.next();
    if (!this.is(")")) {
      do args.push(this.assignment());
      while (this.take(","));
    }
    return { args, to: this.expect(")") };
  }

  first() {
    const from = this.here();
    const word = this.next();
    if (word.kind === "number") {
      const { text } = word;
      const hex = /^0[xX]/.test(text);
      const type = !hex && /[.eEfF]/.test(text) ? "float" : /[uU]$/.test(text) ? "uint" : "int";
      return { type, from, to: from, written: type === "int" && !hex ? [from] : null };
    }
    if (word.text === "(") {
      const inner = this.expression();
      return { type: inner.type, from, to: this.expect(")"), written: inner.written };
    }
    if (word.kind !== "name") throw new Error(`unexpected ${word.text}`);
    if (word.text === "true" || word.text === "false") return { type: "bool", from, to: from };
    if (this.typed(word.text)) {
      // Something made of a kind: a list of them of what each is.
      const listed = this.is("[");
      if (listed) this.closed("[", "]");
      const { args, to } = this.handed();
      if (listed) for (const arg of args) this.fit(arg, word.text);
      return { type: listed ? `${word.text}[]` : word.text, from, to };
    }
    if (this.is("(")) {
      const { args, to } = this.handed();
      return { type: this.called(word.text, args), from, to };
    }
    return { type: this.lookup(word.text), from, to: from };
  }

  // What a function gives back, with what it is handed made what it takes:
  // one of the shader's own, or one of the language's.
  called(name, args) {
    const own = this.functions.get(name);
    if (!own) return RULES[name]?.(this, args) ?? null;
    const count = own.filter((one) => one.takes.length === args.length);
    const one = count.find((each) => each.takes.every((taken, index) => !args[index].type || taken.type === args[index].type)) ?? count[0] ?? own[0];
    one.takes.forEach((taken, index) => {
      if (args[index] && taken.way === "in") this.fit(args[index], taken.type);
    });
    return one.returns;
  }
}
