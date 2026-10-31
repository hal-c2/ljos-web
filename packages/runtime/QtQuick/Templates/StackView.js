// StackView: items one over the other, of which the top one is shown. What
// is pushed is an item, or a component an item is made of when it comes to
// the top; what is popped goes back where it was, or is destroyed when the
// view made it. A style says how one comes and the other goes with six
// transitions, which run on the clock like any other.
//
// This follows Qt's `QQuickStackView` step by step, down to the order its
// signals come in: QML written for it leans on that.
import { defineType, derived, effect, instantiate, QtObject, slot, whenComplete } from "../../object.js";
import { Property } from "../animation/property.js";
import { STOPPED } from "../animation/jobs.js";
import { sized } from "../compute.js";
import { arrived, departing, setFocus } from "../focus.js";
import { settle } from "../settle.js";
import { Control } from "./Control.js";
import { untrack } from "#kernel";

const Inactive = 0;
const Deactivating = 1;
const Activating = 2;
const Active = 3;

const ForceLoad = 1;

const Immediate = 0;
const PushTransition = 1;
const ReplaceTransition = 2;
const PopTransition = 3;

const NOTHING = Object.freeze({});
const NONE = Object.freeze([]);
const next = (version) => version + 1;

const TRANSITIONS = ["pushEnter", "pushExit", "popEnter", "popExit", "replaceEnter", "replaceExit"];
// By operation: the transition of the item that comes, and of the one that
// goes.
const ENTER = [null, "pushEnter", "replaceEnter", "popEnter"];
const EXIT = [null, "pushExit", "replaceExit", "popExit"];
// By status: what the item is told as it gets there.
const TOLD = ["deactivated", "deactivating", "activating", "activated"];

const attachedOf = (item) => item?.$attached?.StackView;
const isItem = (value) => Boolean(value?.$node);
const isComponent = (value) => typeof value === "function" && value.$component === true;
// What is given after an item for its properties: an object that is not one
// of QML's.
const isProperties = (value) => value !== null && typeof value === "object" && !value.$type && !Array.isArray(value);
const isOperation = (value) => Number.isInteger(value);

// One place in the stack. `item` is null until a component's is made, which
// is when it first comes to the top or is asked for.
function entry(item, component, properties) {
  let parent = null;
  if (item) {
    const around = item.parent;
    if (around?.$node && around.children.includes(item)) parent = around;
  }
  return {
    item,
    component,
    properties,
    index: -1,
    view: null,
    status: Inactive,
    // Made here, and destroyed here.
    own: false,
    init: false,
    // It is leaving the stack: gone when its transition is done.
    removal: false,
    // Whether the item said how big it is. One that did not is as big as
    // the view.
    widthValid: false,
    heightValid: false,
    // Where the item was, to put it back.
    parent,
    job: null,
    transition: null,
    dispose: null,
  };
}

// What is attached to the item reads its place from the element.
function tell(element) {
  const item = element.item;
  if (!item) return;
  item.$stacked = element;
  item.$touch(next);
}

function setIndex(element, index) {
  if (element.index === index) return;
  element.index = index;
  tell(element);
}

function setView(element, view) {
  if (element.view === view) return;
  element.view = view;
  tell(element);
}

function setStatus(element, status) {
  if (element.status === status) return;
  element.status = status;
  if (!element.item) return;
  tell(element);
  attachedOf(element.item)?.[TOLD[status]]();
  settle();
}

// An item that says itself whether it is visible (`StackView.visible`) is
// left as it is.
function setVisible(element, visible) {
  const item = element.item;
  if (!item) return;
  const attached = attachedOf(item);
  if (attached && slot(attached, "visible").explicit()) return;
  slot(item, "visible").write(visible);
}

function warn(self, error) {
  const operation = self.$pile.operation;
  console.warn(operation ? `StackView: ${operation}: ${error}` : `StackView: ${error}`);
}

// What a call gave an item to start with, as a Loader's `setSource` does.
function give(item, properties) {
  for (const name of Object.keys(properties)) {
    const own = slot(item, name);
    if (own) own.write(properties[name]);
    else if (name in item) item[name] = properties[name];
  }
}

function leave(parent, item) {
  if (parent.$static.includes(item)) {
    parent.$static = parent.$static.filter((child) => child !== item);
    parent.$touch(next);
  } else {
    parent.$remove(item);
  }
}

// As big as the view, where it says nothing of how big it is.
function fit(self, element, item) {
  element.widthValid = sized(item, "width");
  if (!element.widthValid) slot(item, "width").write(self.width);
  element.heightValid = sized(item, "height");
  if (!element.heightValid) slot(item, "height").write(self.height);
}

function initialize(self, element) {
  const item = element.item;
  if (!item || element.init) return;
  if (!element.begun) fit(self, element, item);
  const parent = item.parent;
  if (parent !== self) {
    departing(item);
    if (parent?.$node) leave(parent, item);
    slot(item, "parent").write(self);
  }
  if (!self.children.includes(item)) self.$add(item);
  if (parent !== self) arrived(item);
  if (element.properties) give(item, element.properties);
  element.properties = undefined;
  element.init = true;
}

// Whether the element has an item, having made it if it had none.
function load(self, element) {
  setView(element, self);
  if (element.init) return element.item !== null;
  if (!element.item) {
    element.own = true;
    const component = element.component;
    if (!isComponent(component)) {
      warn(self, `cannot load ${component}: only a QML file the compiler saw can be loaded`);
      element.init = true;
      return false;
    }
    // An item the view makes is as big as the view and has what the call
    // gave it before it is told that it is complete, as in Qt: its
    // `Component.onCompleted` reads what it was pushed with.
    const begun = (data) => {
      const object = component(data);
      if (!isItem(object)) return object;
      fit(self, element, object);
      if (element.properties) give(object, element.properties);
      element.properties = undefined;
      element.begun = true;
      return object;
    };
    const made = instantiate(begun, element.properties ?? NOTHING, self, self.$owner);
    if (!isItem(made.object)) {
      made.dispose();
      element.init = true;
      return false;
    }
    element.item = made.object;
    element.dispose = made.dispose;
    tell(element);
  }
  initialize(self, element);
  return element.item !== null;
}

function find(pile, item) {
  if (!item) return null;
  for (const element of pile.elements) if (element.item === item) return element;
  return null;
}

// The end of an element. The item the view made goes with it; another is
// hidden and put back where and as it was.
function destroy(self, element) {
  stop(self, element);
  const item = element.item;
  if (!item) return;
  const attached = attachedOf(item);
  if (element.own) {
    departing(item);
    self.$remove(item);
    slot(item, "parent").write(null);
    // Once whoever is told of it has had its say, as Qt's `deleteLater`.
    const dispose = element.dispose;
    if (dispose) queueMicrotask(dispose);
  } else {
    setVisible(element, false);
    if (!element.widthValid) slot(item, "width").reset();
    if (!element.heightValid) slot(item, "height").reset();
    if (item.parent !== element.parent) {
      departing(item);
      self.$remove(item);
      slot(item, "parent").write(element.parent);
      element.parent?.$add(item);
      if (element.parent) arrived(item);
    }
  }
  element.item = null;
  if (item.$stacked === element) {
    item.$stacked = null;
    item.$touch(next);
  }
  attached?.removed();
  settle();
}

function setCurrentItem(self, element) {
  const item = element?.item ?? null;
  if (self.currentItem === item) return;
  slot(self, "currentItem").write(item);
  if (element) setVisible(element, true);
  if (item) setFocus(item, true);
  settle();
}

function depthChange(self, depth, before) {
  if (depth === before) return;
  slot(self, "depth").write(depth);
  settle();
  if (depth !== 0 && before !== 0) return;
  slot(self, "empty").write(depth === 0);
  settle();
}

function setBusy(self, busy) {
  if (self.busy === busy) return;
  slot(self, "busy").write(busy);
  settle();
}

// Qt makes what runs transitions when the view is first given one, and a
// view that never was leaves what is popped where it is.
const lively = (self) => TRANSITIONS.some((name) => slot(self, name).explicit());

function pushElements(self, elements) {
  if (!elements.length) return false;
  const all = self.$pile.elements;
  for (const element of elements) {
    setIndex(element, all.length);
    all.push(element);
  }
  return load(self, all[all.length - 1]);
}

// Down to `element`; with none, the top one only.
function popElements(self, element) {
  const all = self.$pile.elements;
  while (all.length > 1 && all[all.length - 1] !== element) {
    destroy(self, all.pop());
    if (!element) break;
  }
  return load(self, all[all.length - 1]);
}

function replaceElements(self, target, elements) {
  const all = self.$pile.elements;
  if (target) {
    while (all.length) {
      const top = all.pop();
      destroy(self, top);
      if (top === target) break;
    }
  }
  return pushElements(self, elements);
}

// Whether two rectangles overlap; one with no width or no height overlaps
// nothing, as Qt's `QRectF::intersects` has it.
function intersects(width, height, x, y, w, h) {
  if (!(width > 0 && height > 0 && w > 0 && h > 0)) return false;
  return x < width && x + w > 0 && y < height && y + h > 0;
}

// Whether the item's move is one to show: the one that comes or goes by
// itself (`target`) only when it is, or will be, where the view is.
function moves(self, kind, target, item) {
  if (!target) return true;
  const width = self.width;
  const height = self.height;
  if (width === 0 && height === 0) return true;
  const here = () => intersects(width, height, item.x, item.y, item.width, item.height);
  const there = () => intersects(width, height, 0, 0, item.width, item.height);
  if (kind === PushTransition) return there();
  if (kind === PopTransition) return here();
  return here() || there();
}

// What is running for the element is given up where it is.
function stop(self, element) {
  const job = element.job;
  if (!job) return;
  element.job = null;
  self.$pile.running.delete(element);
  job.stop();
  element.transition.$ran(false);
  element.transition = null;
}

const change = (item, name) => ({ property: new Property(item, name), from: undefined, to: 0, shown: false, kind: 0, a: null, b: null });

function animate(self, element, transition, status) {
  setStatus(element, status);
  const item = element.item;
  stop(self, element);
  // The item ends where the view is: an animation of `x` or `y` takes it
  // there, and with none it is there at once.
  const actions = [change(item, "x"), change(item, "y")];
  const modified = [];
  const job = transition.$prepare(actions, modified, false, item);
  element.job = job;
  element.transition = transition;
  self.$pile.running.add(element);
  job.listener = {
    finished: () => {
      if (element.job !== job) return;
      element.job = null;
      element.transition = null;
      self.$pile.running.delete(element);
      transition.$ran(false);
      untrack(() => finished(self, element));
      settle();
    },
  };
  transition.$ran(true);
  job.start();
  for (const action of actions) if (!modified.includes(action)) action.property.write(action.to);
}

// With no time to pass: the transition's animations are made all the same,
// and put at their end, so that what they would have changed is.
function complete(self, element, transition) {
  stop(self, element);
  const job = transition.$prepare(NONE, [], false, element.item);
  job.start();
  if (job.state === STOPPED) return;
  const length = job.totalDuration();
  if (length >= 0) job.setCurrentTime(length);
  job.stop();
}

function finished(self, element) {
  const pile = self.$pile;
  if (element.status === Activating) {
    setStatus(element, Active);
  } else if (element.status === Deactivating) {
    setStatus(element, Inactive);
    // An item that is in the stack again by now stays as it is.
    const live = find(pile, element.item);
    if (!live || live === element) setVisible(element, false);
    if (element.removal) pile.removed.push(element);
  }
  if (!lively(self) || pile.running.size) return;
  setBusy(self, false);
  const removed = pile.removed.splice(0);
  for (const one of removed) if (find(pile, one.item)) one.item = null;
  for (const one of removed) destroy(self, one);
}

// One element's part in a change: `name` is the transition of the six that
// is for it, `kind` the operation that one belongs to.
function transit(self, element, status, kind, target, name, immediate, alive) {
  if (!element) return;
  const item = element.item;
  const transition = alive ? (self[name] ?? null) : null;
  let moving = false;
  if (item && alive) {
    moving = moves(self, kind, target, item) && transition !== null && transition.enabled;
    if (!moving) {
      slot(item, "x").write(0);
      slot(item, "y").write(0);
      stop(self, element);
    }
  }
  if (moving && !immediate) return animate(self, element, transition, status);
  setStatus(element, status);
  if (transition && item) complete(self, element, transition);
  finished(self, element);
}

const kindOf = (operation, usual) => (operation === PushTransition || operation === ReplaceTransition || operation === PopTransition ? operation : usual);

const enter = (self, element, operation, usual, immediate, alive) => {
  const kind = kindOf(operation, usual);
  transit(self, element, Activating, kind, kind !== PopTransition, ENTER[kind], immediate, alive);
};

const exit = (self, element, operation, usual, immediate, alive) => {
  const kind = kindOf(operation, usual);
  transit(self, element, Deactivating, kind, kind === PopTransition, EXIT[kind], immediate, alive);
};

// The two items of a change, in the order Qt takes them: the one that comes
// first, but for a pop.
function startTransition(self, entering, exiting, operation, usual, immediate) {
  const alive = lively(self);
  if (usual === PushTransition) {
    enter(self, entering, operation, usual, immediate, alive);
    exit(self, exiting, operation, usual, immediate, alive);
  } else {
    exit(self, exiting, operation, usual, immediate, alive);
    enter(self, entering, operation, usual, immediate, alive);
  }
  if (alive) setBusy(self, self.$pile.running.size > 0);
}

function create(self, value, errors) {
  if (isItem(value)) return entry(value, null, undefined);
  if (isComponent(value) || typeof value === "string") return entry(null, value, undefined);
  if (value?.$type) errors.push(`${value.$type.name} is not supported. Must be Item or Component.`);
  return null;
}

// The element `list[at]` makes, with the properties that follow it, and the
// place of what was read last.
function take(self, list, at, elements, errors) {
  const element = create(self, list[at], errors);
  if (!element) return at;
  if (at < list.length - 1 && isProperties(list[at + 1])) element.properties = list[++at];
  elements.push(element);
  return at;
}

// What `push` and `replace` were called with: items, components and files,
// each with its properties after it, on their own or in arrays.
function parse(self, args, from, errors) {
  const elements = [];
  for (let index = from; index < args.length; index++) {
    const arg = args[index];
    if (Array.isArray(arg)) for (let at = 0; at < arg.length; at++) at = take(self, arg, at, elements, errors);
    else index = take(self, args, index, elements, errors);
  }
  return elements;
}

// The same for the calls of Qt 6.7, which take no arrays in arrays and say
// when properties are out of place.
function parseStrict(self, args) {
  const pile = self.$pile;
  const elements = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    let properties;
    if (index < args.length - 1 && isProperties(args[index + 1])) properties = args[++index];
    if (isItem(arg) && find(pile, arg)) continue;
    if (isProperties(arg)) {
      console.warn("StackView: Properties must come after an Item, Component or URL");
      return NONE;
    }
    const element = create(self, arg, NONE);
    if (!element) continue;
    element.properties = properties;
    elements.push(element);
  }
  return elements;
}

// One change of the stack at a time: what a handler asks for in the middle
// of another is refused, as in Qt.
function modify(self, name, work, args, operation) {
  const pile = self.$pile;
  if (pile.modifying) {
    console.warn(`StackView: cannot ${name} while already in the process of completing a ${pile.operation}`);
    return null;
  }
  const before = pile.operation;
  pile.modifying = true;
  pile.operation = name;
  try {
    return untrack(() => work(self, args, operation));
  } finally {
    pile.modifying = false;
    pile.operation = before;
    settle();
  }
}

const top = (pile) => pile.elements[pile.elements.length - 1] ?? null;

function reject(self, errors) {
  if (errors.length) for (const error of errors) warn(self, error);
  else warn(self, "nothing to push");
  return null;
}

function push(self, args) {
  const pile = self.$pile;
  if (!args.length) return warn(self, "missing arguments"), null;
  const last = args[args.length - 1];
  const operation = isOperation(last) ? last : pile.elements.length ? PushTransition : Immediate;
  const errors = [];
  // An item cannot be in two places at once.
  const elements = parse(self, args, 0, errors).filter((element) => !find(pile, element.item));
  if (errors.length || !elements.length) return reject(self, errors);
  return pushed(self, elements, operation);
}

function pushed(self, elements, operation) {
  const pile = self.$pile;
  const exiting = top(pile);
  const before = pile.elements.length;
  if (pushElements(self, elements)) {
    depthChange(self, pile.elements.length, before);
    const entering = top(pile);
    startTransition(self, entering, exiting, operation, PushTransition, operation === Immediate);
    setCurrentItem(self, entering);
  }
  return self.currentItem;
}

function pop(self, args) {
  const pile = self.$pile;
  const all = pile.elements;
  if (all.length <= 1 || args.length > 2) {
    if (args.length > 2) warn(self, "too many arguments");
    return null;
  }
  const before = all.length;
  const exiting = all.pop();
  let entering = top(pile);
  if (args.length) {
    const to = args[0];
    if (to === null) {
      entering = all[0];
    } else if (to?.$type) {
      entering = find(pile, to);
      if (!entering) {
        if (to !== self.currentItem) warn(self, `can't find item to pop: ${to.$type.name}`);
        all.push(exiting);
        return null;
      }
    }
  }
  const last = args[args.length - 1];
  return popped(self, exiting, entering, isOperation(last) ? last : PopTransition, before);
}

function popped(self, exiting, entering, operation, before) {
  const pile = self.$pile;
  if (!popElements(self, entering)) return null;
  exiting.removal = true;
  const previous = exiting.item;
  depthChange(self, pile.elements.length, before);
  startTransition(self, entering, exiting, operation, PopTransition, operation === Immediate);
  setCurrentItem(self, entering);
  return previous;
}

function replace(self, args) {
  const pile = self.$pile;
  const all = pile.elements;
  if (!args.length) return warn(self, "missing arguments"), null;
  const last = args[args.length - 1];
  const operation = isOperation(last) ? last : all.length ? ReplaceTransition : Immediate;
  // What is replaced: the top one, or all down to the one named first.
  const first = args[0];
  const target = first === null ? (all[0] ?? null) : isItem(first) ? find(pile, first) : null;
  const errors = [];
  const elements = parse(self, args, target ? 1 : 0, errors);
  if (errors.length || !elements.length) return reject(self, errors);
  return replaced(self, target, elements, operation);
}

function replaced(self, target, elements, operation) {
  const pile = self.$pile;
  const all = pile.elements;
  if (!elements.length) return self.currentItem;
  const before = all.length;
  const exiting = all.pop() ?? null;
  if (exiting !== target ? replaceElements(self, target, elements) : pushElements(self, elements)) {
    depthChange(self, all.length, before);
    if (exiting) exiting.removal = true;
    startTransition(self, top(pile), exiting, operation, ReplaceTransition, operation === Immediate);
    setCurrentItem(self, top(pile));
  }
  return self.currentItem;
}

// `keep`: the current item is not popped, when it is the one named.
function popToItem(self, item, operation, keep) {
  const pile = self.$pile;
  const all = pile.elements;
  if (!all.length) return warn(self, "no items to pop"), null;
  if (!item) return warn(self, "item cannot be null"), null;
  const before = all.length;
  const exiting = all.pop();
  let entering = top(pile);
  let nothing = false;
  if (item !== self.currentItem) {
    entering = find(pile, item);
    if (!entering) {
      warn(self, `can't find item to pop: ${item.$type?.name}`);
      nothing = true;
    }
  } else if (keep) {
    nothing = true;
  }
  if (nothing || !entering) {
    all.push(exiting);
    return null;
  }
  return popped(self, exiting, entering, operation, before);
}

function clear(self, args, operation) {
  const pile = self.$pile;
  const all = pile.elements;
  const before = all.length;
  if (operation !== Immediate) {
    const exiting = all.pop();
    exiting.removal = true;
    startTransition(self, null, exiting, operation, PopTransition, false);
  }
  setCurrentItem(self, null);
  for (const element of all.splice(0)) destroy(self, element);
  depthChange(self, 0, before);
  return null;
}

const StackViewAttached = defineType("StackViewAttached", QtObject, {
  properties: {
    index: derived((self) => self.$element()?.index ?? -1),
    view: derived((self) => self.$element()?.view ?? null),
    status: derived((self) => self.$element()?.status ?? Inactive),
    visible: undefined,
  },
  resolve: { visible: (self) => self.$of.visible ?? false },
  signals: ["activated", "activating", "deactivated", "deactivating", "removed"],
  methods: {
    $element() {
      const item = this.$of;
      item.$track();
      return item.$stacked ?? null;
    },
  },
  setup(self, props) {
    const item = (self.$of = props.$attachee);
    // What the QML says of `StackView.visible` is the item's `visible`, and
    // taken back, the item is visible when it is the current one.
    let said;
    effect(
      () => {
        const given = slot(self, "visible");
        return given.explicit() ? Boolean(given.own()) : undefined;
      },
      (value) => {
        if (value === said || !item.$node) return;
        const before = said;
        said = value;
        if (value !== undefined) return void slot(item, "visible").write(value);
        const view = before === undefined ? null : item.$stacked?.view;
        if (view) slot(item, "visible").write(untrack(() => view.currentItem) === item);
      },
    );
  },
});

export const StackView = defineType("StackView", Control, {
  properties: {
    initialItem: undefined,
    currentItem: null,
    depth: 0,
    empty: true,
    busy: false,
    pushEnter: null,
    pushExit: null,
    popEnter: null,
    popExit: null,
    replaceEnter: null,
    replaceExit: null,
  },
  enums: {
    Inactive,
    Deactivating,
    Activating,
    Active,
    DontLoad: 0,
    ForceLoad,
    Transition: -1,
    Immediate,
    PushTransition,
    ReplaceTransition,
    PopTransition,
  },
  attached: StackViewAttached,
  methods: {
    $focusScope: true,
    // Nothing in it is pressed while one item comes and another goes.
    $blocks() {
      return untrack(() => this.busy);
    },
    get(index, behavior) {
      const element = this.$pile.elements[index];
      if (!element) return null;
      if (behavior === ForceLoad) {
        untrack(() => load(this, element));
        settle();
      }
      return element.item;
    },
    // The first item from the top that `callback(item, index)` says yes to.
    find(callback, behavior) {
      if (typeof callback !== "function") return null;
      const all = this.$pile.elements;
      for (let index = all.length - 1; index >= 0; index--) {
        const element = all[index];
        if (behavior === ForceLoad) untrack(() => load(this, element));
        if (element.item && callback(element.item, index)) return element.item;
      }
      return null;
    },
    push(...args) {
      return modify(this, "push", push, args);
    },
    pop(...args) {
      return modify(this, "pop", pop, args);
    },
    replace(...args) {
      return modify(this, "replace", replace, args);
    },
    clear(operation = Immediate) {
      if (!this.$pile.elements.length) return;
      modify(this, "clear", clear, NONE, operation);
    },
    // Qt 6.7: the same, a call for each thing they did.
    pushItems(args, operation = PushTransition) {
      return modify(this, "pushItem", (self) => pushed(self, parseStrict(self, args), operation));
    },
    pushItem(item, properties, operation = PushTransition) {
      return this.pushItems([item, properties ?? {}], operation);
    },
    popToItem(item, operation = PopTransition) {
      return modify(this, "pop", (self) => popToItem(self, item, operation, true));
    },
    popToIndex(index, operation = PopTransition) {
      const all = this.$pile.elements;
      if (!(index >= 0 && index < all.length)) {
        console.warn(`StackView: popToIndex: index ${index} is out of bounds (${all.length} item(s))`);
        return null;
      }
      if (index === all.length - 1) return null;
      const element = all[index];
      untrack(() => load(this, element));
      return modify(this, "pop", (self) => popToItem(self, element.item, operation, false));
    },
    popCurrentItem(operation = PopTransition) {
      const all = this.$pile.elements;
      if (all.length === 1) {
        const last = all[0].item;
        this.clear(operation);
        return last;
      }
      return modify(this, "pop", (self) => popToItem(self, self.currentItem, operation, false));
    },
    replaceCurrentItem(item, properties, operation) {
      // Either a list and how, or one thing, its properties and how.
      const args = Array.isArray(item) ? item : [item, isProperties(properties) ? properties : {}];
      const how = (Array.isArray(item) ? properties : operation) ?? ReplaceTransition;
      return modify(this, "replace", (self) => replaced(self, top(self.$pile), parseStrict(self, args), how));
    },
  },
  setup(self) {
    const pile = (self.$pile = {
      elements: [],
      // Those whose transition is running, and those that go once none is.
      running: new Set(),
      removed: [],
      modifying: false,
      operation: "",
    });
    whenComplete(() =>
      untrack(() => {
        const initial = self.initialItem;
        if (initial == null) return;
        pile.operation = "initialItem";
        const errors = [];
        const element = create(self, initial, errors);
        for (const error of errors) warn(self, error);
        if (element && pushElements(self, [element])) {
          // It is there before anything listens for a change: the view's
          // own handlers are told of it here, in the order Qt tells them.
          const props = self.$props;
          depthChange(self, pile.elements.length, 0);
          props.onDepthChanged?.();
          props.onEmptyChanged?.();
          setCurrentItem(self, element);
          props.onCurrentItemChanged?.();
          setStatus(element, Active);
        }
        pile.operation = "";
      }),
    );
    // An item that did not say how big it is, is as big as the view.
    let width;
    let height;
    effect(
      () => [self.width, self.height],
      (size) => {
        if (size[0] === width && size[1] === height) return;
        [width, height] = size;
        for (const element of pile.elements) {
          const item = element.item;
          if (!item) continue;
          if (!element.widthValid) slot(item, "width").write(width);
          if (!element.heightValid) slot(item, "height").write(height);
        }
      },
    );
  },
});
