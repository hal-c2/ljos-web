// Where a point of one item is in another: what `mapToItem` answers, and
// what a pointer event needs to say where in an item it happened.
//
// A matrix is six numbers, `[a, b, c, d, e, f]`, as in CSS: a point (x, y)
// goes to (a x + c y + e, b x + d y + f). An item's is what Item gives its
// element as a transform, so a point maps where it is seen.

// `[a, b, c, d, e, f]`.
export type Matrix = [number, number, number, number, number, number];
export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  width: number;
  height: number;
}
// What a transform in an item's `transform` list gives.
interface Transform {
  $css(): string;
}
// What the coordinates of an item are worked out from.
export interface Spatial {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  transformOrigin: number;
  transform?: Transform | readonly Transform[] | null;
  parent?: Spatial | null;
  children: Spatial[];
  visible: boolean;
  contains(point: Point): boolean;
  $node?: HTMLElement | SVGElement | null;
}
// `(x, y)`, `(point)`, `(x, y, width, height)` or `(rect)`.
type Mapping = [first?: number | Point | Rect, y?: number, width?: number, height?: number];

const translate = (m: Matrix, x: number, y: number): void => {
  m[4] += m[0] * x + m[2] * y;
  m[5] += m[1] * x + m[3] * y;
};

const scale = (m: Matrix, by: number): void => {
  m[0] *= by;
  m[1] *= by;
  m[2] *= by;
  m[3] *= by;
};

const rotate = (m: Matrix, degrees: number): void => {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const [a, b, c, d] = m;
  m[0] = a * cos + c * sin;
  m[1] = b * cos + d * sin;
  m[2] = c * cos - a * sin;
  m[3] = d * cos - b * sin;
};

const multiply = (m: Matrix, a: number, b: number, c: number, d: number, e: number, f: number): void => {
  const [ma, mb, mc, md] = m;
  m[0] = ma * a + mc * b;
  m[1] = mb * a + md * b;
  m[2] = ma * c + mc * d;
  m[3] = mb * c + md * d;
  m[4] += ma * e + mc * f;
  m[5] += mb * e + md * f;
};

// The point `rotation` and `scale` are about, in the item.
export function origin(item: Spatial): Point {
  const at = item.transformOrigin;
  return { x: ((at % 3) / 2) * item.width, y: (Math.floor(at / 3) / 2) * item.height };
}

// Takes `m` from the coordinates of the item's parent to the item's own.
function enter(m: Matrix, item: Spatial): void {
  translate(m, item.x, item.y);
  const list = item.transform;
  if (list) {
    const all: readonly Transform[] = Array.isArray(list) ? list : [list];
    for (let index = all.length - 1; index >= 0; index--) {
      // A rotation about another axis is seen flat, as it is hit.
      const { a, b, c, d, e, f } = new DOMMatrix(all[index]!.$css());
      multiply(m, a, b, c, d, e, f);
    }
  }
  const by = item.scale;
  const rotation = item.rotation;
  if (by !== 1 || rotation !== 0) {
    const { x, y } = origin(item);
    translate(m, x, y);
    scale(m, by);
    rotate(m, rotation);
    translate(m, -x, -y);
  }
}

// The matrix from an item's coordinates to the scene's, into `m`. With no
// item it is the scene itself.
export function toScene(item: Spatial | null | undefined, m: Matrix = [1, 0, 0, 1, 0, 0]): Matrix {
  m[0] = m[3] = 1;
  m[1] = m[2] = m[4] = m[5] = 0;
  if (item) descend(m, item);
  return m;
}

function descend(m: Matrix, item: Spatial): void {
  const parent = item.parent;
  if (parent?.$node) descend(m, parent);
  enter(m, item);
}

export function apply(m: Matrix, x: number, y: number): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

// The point that `m` takes to (x, y). An item scaled to nothing has none:
// everything in it is at one point.
export function unapply(m: Matrix, x: number, y: number): Point {
  const determinant = m[0] * m[3] - m[1] * m[2];
  if (determinant === 0) return { x: 0, y: 0 };
  const dx = x - m[4];
  const dy = y - m[5];
  return { x: (m[3] * dx - m[2] * dy) / determinant, y: (m[0] * dy - m[1] * dx) / determinant };
}

// One matrix for the calls below, which finish with it before they return.
const scratch: Matrix = [1, 0, 0, 1, 0, 0];

export const itemToScene = (item: Spatial | null | undefined, x: number, y: number): Point => apply(toScene(item, scratch), x, y);
export const sceneToItem = (item: Spatial | null | undefined, x: number, y: number): Point => unapply(toScene(item, scratch), x, y);

// The item at the top of the tree `item` is in: what a window shows.
export function topOf(item: Spatial): Spatial {
  let top = item;
  for (let parent = top.parent; parent?.$node; parent = top.parent) top = parent;
  return top;
}

// Where a scene is in the page, and how much the page has scaled it. The
// scene is the element the top item was mounted in.
export function frameOf(element: HTMLElement | null | undefined): { left: number; top: number; zoom: number } {
  if (!element) return { left: 0, top: 0, zoom: 1 };
  const box = element.getBoundingClientRect();
  const zoom = element.offsetWidth > 0 ? box.width / element.offsetWidth : 1;
  return { left: box.left + element.clientLeft * zoom, top: box.top + element.clientTop * zoom, zoom };
}

// A shown item has an element, and so has the top it is in.
const frame = (item: Spatial) => frameOf(topOf(item).$node!.parentElement);

// Global coordinates are the page's: where `clientX` and `clientY` measure.
export function sceneToGlobal(item: Spatial, x: number, y: number): Point {
  const { left, top, zoom } = frame(item);
  return { x: left + x * zoom, y: top + y * zoom };
}

export function globalToScene(item: Spatial, x: number, y: number): Point {
  const { left, top, zoom } = frame(item);
  return { x: (x - left) / zoom, y: (y - top) / zoom };
}

// `mapToItem(item, x, y)`, `(item, point)`, `(item, x, y, width, height)` and
// `(item, rect)`: Qt takes all four.
function mapped(from: Spatial | null | undefined, to: Spatial | null | undefined, args: Mapping): Point | Rect {
  const first = args[0];
  const given = typeof first === "object" && first !== null ? (first as Point & Partial<Rect>) : null;
  const x = given ? given.x : ((first as number | undefined) ?? 0);
  const y = given ? given.y : (args[1] ?? 0);
  const width = given ? given.width : args[2];
  const height = given ? given.height : args[3];
  const out: Matrix = [...toScene(from, scratch)];
  const back = toScene(to, scratch);
  const point = (px: number, py: number): Point => {
    const scene = apply(out, px, py);
    return unapply(back, scene.x, scene.y);
  };
  if (width === undefined) return point(x, y);
  // A rectangle maps to the one around its four corners.
  const corners = [point(x, y), point(x + width, y), point(x, y + height!), point(x + width, y + height!)];
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

const pointOf = (x: number | Point | undefined, y: number | undefined): Point => (typeof x === "object" && x !== null ? x : { x: x ?? 0, y: y ?? 0 });

// Item's coordinate functions, with the item as `this`.
export const methods = {
  mapToItem(this: Spatial, item: Spatial | null, ...args: Mapping): Point | Rect {
    return mapped(this, item, args);
  },
  mapFromItem(this: Spatial, item: Spatial | null, ...args: Mapping): Point | Rect {
    return mapped(item, this, args);
  },
  mapToGlobal(this: Spatial, x: number | Point, y?: number): Point {
    const point = pointOf(x, y);
    const scene = itemToScene(this, point.x, point.y);
    return sceneToGlobal(this, scene.x, scene.y);
  },
  mapFromGlobal(this: Spatial, x: number | Point, y?: number): Point {
    const point = pointOf(x, y);
    const scene = globalToScene(this, point.x, point.y);
    return sceneToItem(this, scene.x, scene.y);
  },
  // Its right and bottom edges are outside an item.
  contains(this: Spatial, point: Point): boolean {
    return point.x >= 0 && point.y >= 0 && point.x < this.width && point.y < this.height;
  },
  // The last of the children the point is in, whatever their `z`.
  childAt(this: Spatial, x: number, y: number): Spatial | null {
    const children = this.children;
    for (let index = children.length - 1; index >= 0; index--) {
      const child = children[index]!;
      if (child.visible && child.contains(mapped(this, child, [x, y]))) return child;
    }
    return null;
  },
};
