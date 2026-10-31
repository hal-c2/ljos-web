// A mounted root, inspected and driven by what its QML says: a property read
// and written by `id`, a click on an object or at a point, the object tree,
// the object at a point with where it is written, and the lines logged with
// their file and line. The answers are the ones Ljós's own inspector gives
// of the same file, in the same shapes (its `app_inspect`, `app_click`,
// `app_objects` and `app_logs`), so that a host maps one onto the other.
//
// Where things are written is what qmlc puts in when asked (`--inspect`,
// the Vite plugin's `inspect`): `$at`, `$id` and `$ids` among an object's
// props, and `$console` and `$bound` around what logs and what binds. A page
// built without it has none of them and never imports this module; an object of such a file is listed and clicked all
// the same, with no place.
import { flush } from "./object.js";

// What each of `console`'s calls is, as Qt's message types: qml6 says
// `console.log` is a debug message and `console.error` a critical one.
const LEVELS = { debug: "debug", log: "debug", info: "info", warn: "warning", error: "critical" };
// The lines kept: the oldest give way.
const KEPT = 1000;
// An answer lists at most this many, as Ljós's does.
const ANSWERED = 100;

// One log for the page, whichever roots are inspected: a console is the
// page's. Kept on the console itself so that a module loaded twice (a dev
// server's update) wraps it once.
const log =
  console.$inspected ??
  (() => {
    const kept = { lines: [], count: 0, place: null };
    for (const name of Object.keys(LEVELS)) {
      const said = console[name];
      console[name] = (...args) => {
        const place = kept.place;
        kept.place = null;
        const line = { level: LEVELS[name], category: "qml", message: args.map(text).join(" ") };
        line.file = place?.[0] ?? null;
        line.line = place?.[1] ?? null;
        kept.lines.push([kept.count++, line]);
        if (kept.lines.length > KEPT) kept.lines.shift();
        return said.apply(console, args);
      };
    }
    Object.defineProperty(console, "$inspected", { value: kept });
    return kept;
  })();

// What a logged value reads as, as qml6 prints it: a string as it is.
function text(value) {
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

// `console` where a QML file names it, compiled with `--inspect`: the line
// it logs says where it is written.
export function $console(place) {
  const placed = Object.create(console);
  for (const name of Object.keys(LEVELS)) {
    placed[name] = (...args) => {
      log.place = place;
      return console[name](...args);
    };
  }
  return placed;
}

// A binding where a QML file is written, compiled with `--inspect`: what it
// throws says where the binding is. The runtime tells a binding's failure as
// `key: error`, made a string just before it is logged, so that is where the
// place is put; it does not last past the task, should nothing log it. The
// binding that failed first says, not the one that read it.
export function $bound(place, compute) {
  try {
    return compute();
  } catch (error) {
    if (error && typeof error === "object" && !Object.hasOwn(error, Symbol.toPrimitive)) {
      Object.defineProperty(error, Symbol.toPrimitive, {
        configurable: true,
        value() {
          log.place = place;
          queueMicrotask(() => log.place === place && (log.place = null));
          return Error.prototype.toString.call(this);
        },
      });
    }
    throw error;
  }
}

// What made an object, the component's own file first and the file that
// used the component last.
function levels(props) {
  return props.$levels ?? [props];
}

// Where an object is written, and the id it has there: the outermost level
// that says, which is where it is used. The root of a component's file is
// where an instance of it is written, and a delegate's object where the
// delegate is.
function declared(object) {
  const props = object?.$props;
  if (!props) return null;
  return levels(props).findLast((level) => level.$at) ?? null;
}

// The type an object is written as where it is, or its type's name.
function typeOf(object) {
  return declared(object)?.$at[3] ?? object.$type?.typeName ?? "QtObject";
}

const idOf = (object) => declared(object)?.$id ?? "";

function source(object) {
  const at = declared(object)?.$at;
  return at ? { file: at[0], line: at[1], column: at[2] } : null;
}

// The ids an object's file gives its objects: those of the file whose root
// the object is, the one that used it last. A component's own are its
// file's, not its user's.
function ids(object) {
  const level = levels(object.$props ?? {}).findLast((level) => level.$ids);
  return level?.$ids() ?? {};
}

// What the objects below one are, in Qt's order of its `data`: what is not
// an item first (a Timer, a handler), then its children. A Window's are its
// content item's.
function below(object) {
  const inner = object.$contentItem ?? object;
  const declared = inner.$static ? [...inner.$static, ...(inner.$extra ?? [])] : [];
  const others = declared.filter((child) => child?.$type && !child.$node && !child.$siblings);
  const items = inner.$node ? [...(inner.children ?? [])] : [];
  return [...others, ...items].filter((child) => child?.$type);
}

// A value as an answer has it: JSON, with an object named by its type and id.
function plain(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(plain);
  if (value.$type) return { type: typeOf(value), id: idOf(value), object_name: value.objectName ?? "" };
  if (typeof value.toString === "function" && value.toString !== Object.prototype.toString) return value.toString();
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

const failed = (error, message) => ({ error, message });

export function inspect(root) {
  // The object an id names: in the root's file, or the object given.
  const find = (target) => {
    if (target && typeof target === "object") return target.$type ? target : null;
    return Object.hasOwn(ids(root), target) ? ids(root)[target] : null;
  };
  // The root's own item: a Window's content.
  const item = root.$contentItem ?? root;

  // From the root's own place in logical pixels to the page's, whatever it
  // is scaled by.
  const frame = () => {
    const box = item.$node.getBoundingClientRect();
    const scale = item.width > 0 ? box.width / item.width : 1;
    return { box, scale, width: item.width, height: item.height };
  };
  const inside = ({ width, height }, [x, y]) => x >= 0 && y >= 0 && x < width && y < height;
  const toPage = ({ box, scale }, [x, y]) => [box.left + x * scale, box.top + y * scale];

  // The object each element on the page draws, for what is below the root.
  const drawn = () => {
    const items = new Map();
    const walk = (object) => {
      if (object.$node) items.set(object.$node, object);
      for (const child of below(object)) walk(child);
    };
    walk(root);
    return items;
  };

  return {
    find,

    // `{ name: value }`, null when no object has the id.
    read(target, names) {
      const object = find(target);
      if (!object) return null;
      flush();
      return Object.fromEntries(names.map((name) => [name, plain(object[name])]));
    },

    // Assigned as a script assigns it: the property's own binding is gone,
    // and what reads the property follows.
    write(target, name, value) {
      const object = find(target);
      if (!object || !(name in object)) return false;
      object[name] = value;
      flush();
      return true;
    },

    // A move, a press and a release at the point, as the mouse makes them:
    // whatever is drawn on top there gets them, through the same handlers.
    // `{ at: [x, y] }` is a point of the root in logical pixels, its right
    // and bottom edges not in it; an object is clicked at its centre.
    click(target) {
      const shape = frame();
      let at;
      if (target && Array.isArray(target.at)) at = target.at;
      else {
        const object = find(target);
        if (!object) return failed("not_found", `no object is \`${target}\``);
        if (!object.$node) return failed("not_actionable", `\`${target}\` is drawn nowhere`);
        const box = object.$node.getBoundingClientRect();
        at = [(box.left + box.width / 2 - shape.box.left) / shape.scale, (box.top + box.height / 2 - shape.box.top) / shape.scale];
      }
      if (!inside(shape, at)) return failed("not_actionable", `[${at}] is outside the root`);
      const [clientX, clientY] = toPage(shape, at);
      const element = document.elementFromPoint(clientX, clientY);
      if (!element) return failed("not_actionable", `[${at}] is not on the page`);
      const pointer = { bubbles: true, cancelable: true, composed: true, view: window, clientX, clientY, pointerId: 1, pointerType: "mouse", isPrimary: true };
      const pressed = { ...pointer, button: 0, buttons: 1, detail: 1 };
      const released = { ...pointer, button: 0, buttons: 0, detail: 1 };
      element.dispatchEvent(new PointerEvent("pointermove", { ...pointer, buttons: 0 }));
      element.dispatchEvent(new MouseEvent("mousemove", { ...pointer, buttons: 0 }));
      element.dispatchEvent(new PointerEvent("pointerdown", pressed));
      element.dispatchEvent(new MouseEvent("mousedown", pressed));
      // What the press took is where the release goes, as a real one is.
      const up = document.elementFromPoint(clientX, clientY) ?? element;
      up.dispatchEvent(new PointerEvent("pointerup", released));
      up.dispatchEvent(new MouseEvent("mouseup", released));
      up.dispatchEvent(new MouseEvent("click", released));
      flush();
      return { at };
    },

    // The object tree: each object with its depth, type, id, objectName,
    // whether it is an item and how many are below it, and the same as an
    // indented outline, `Type#id "objectName"` a line.
    outline() {
      const objects = [];
      const lines = [];
      const walk = (object, depth) => {
        const children = below(object);
        const row = {
          object,
          depth,
          type: typeOf(object),
          id: idOf(object),
          object_name: object.objectName ?? "",
          item: Boolean(object.$node),
          children: children.length,
        };
        objects.push(row);
        lines.push(`${"  ".repeat(depth)}${row.type}${row.id ? `#${row.id}` : ""}${row.object_name ? ` "${row.object_name}"` : ""}`);
        for (const child of children) walk(child, depth + 1);
      };
      walk(root, 0);
      return { objects, text: lines.join("\n") };
    },

    // The topmost object drawn at a point of the root, and where it is
    // written; null outside it. One that is not shown, is wholly
    // transparent or is clipped away there is not drawn there.
    pick(x, y) {
      const shape = frame();
      if (!inside(shape, [x, y])) return null;
      const [clientX, clientY] = toPage(shape, [x, y]);
      const items = drawn();
      for (let element of document.elementsFromPoint(clientX, clientY)) {
        while (element && !items.has(element)) element = element.parentElement;
        const object = element && items.get(element);
        if (!object || object.opacity === 0 || !object.visible) continue;
        return { object, type: typeOf(object), id: idOf(object), source: source(object) };
      }
      return null;
    },

    // The lines logged since `since` (an answer's `next_since`), oldest
    // first: each with its level, `qml` as qml6 says, the message, and the
    // file and line it is written at when that is known.
    logs(since = 0) {
      const entries = log.lines.filter(([count]) => count >= since).slice(0, ANSWERED);
      const next = entries.length ? entries.at(-1)[0] + 1 : Math.max(since, log.count);
      return { entries: entries.map(([, line]) => line), next_since: next };
    },
  };
}
