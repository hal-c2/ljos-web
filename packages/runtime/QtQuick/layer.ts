// An item's layer: `layer.enabled` and `layer.effect`.
//
// Qt draws an item that has a layer into a texture, and where the layer has
// an effect, makes one, gives it that texture as its `source` and draws it
// in the item's stead: where the item is, as big, turned and scaled as it
// is. A page cannot draw its own elements into a texture. So the item goes
// on being drawn itself, and its effect is drawn under it: a shadow shows
// around the item and through it, as it does in Qt. What an effect does with
// its source is its own to say: a MultiEffect does it to the item's own
// element, a ShaderEffect draws what it would of nothing, but for an item
// that is a picture, a canvas or another effect, which it has to draw: the
// item is then drawn over what the effect made of it.
//
// A layer with no effect is the item drawn as one thing, which is what a
// page does with an element in any case.
import { onCleanup } from "solid-js";
import { defineType, effect, group, inside, instantiate, QtObject, settle, slot, whenHeld } from "../object.ts";
import { Rect, Size } from "../QtQml/values.ts";
import { untrack } from "#kernel";
import type { Dynamic, Instantiated, Props, QObject } from "../object.ts";

// An item that may have a layer: what this module reads and sets of it.
interface Layered extends Dynamic {
  layer: Dynamic;
  parent: QObject | null | undefined;
  $layerEffect?: HTMLElement | SVGElement | null | undefined;
}

type Make = (data?: Props) => QObject | null;
type Made = Instantiated & { parent: QObject | null | undefined };

export const layer = group({
  enabled: false,
  effect: null as unknown,
  samplerName: "source",
  textureSize: Object.freeze(new Size(0, 0)),
  sourceRect: Object.freeze(new Rect(0, 0, 0, 0)),
  mipmap: false,
  smooth: false,
  live: true,
  wrapMode: 0,
  format: 0,
  textureMirroring: 2,
  samples: 0,
});

// What an effect is given as its source: the texture Qt would have made of
// the item, which names the item it is of.
const Source = defineType("ShaderEffectSource", QtObject, {
  properties: {
    sourceItem: null as unknown,
    width: 0,
    height: 0,
    hideSource: false,
    recursive: false,
    textureSize: null as unknown,
    sourceRect: null as unknown,
    mipmap: false,
    smooth: false,
    live: true,
    wrapMode: 0,
    format: 0,
    textureMirroring: 2,
    samples: 0,
  },
});

function source(self: Layered): QObject {
  const taken: PropertyDescriptorMap = { sourceItem: { get: () => self, enumerable: true } };
  for (const name of ["width", "height"]) taken[name] = { get: () => self[name], enumerable: true };
  for (const name of ["textureSize", "sourceRect", "mipmap", "smooth", "live", "wrapMode", "format", "textureMirroring", "samples"]) {
    taken[name] = { get: () => self.layer[name], enumerable: true };
  }
  const made = inside(self, () => Source(Object.defineProperties({}, taken)));
  // The item itself, for an effect that does what it does to that.
  (made as unknown as Dynamic).$layer = self;
  return made;
}

// What Qt gives the effect of the item's: it is where the item is.
const MIRRORED = ["x", "y", "width", "height", "z", "opacity", "scale", "rotation", "transformOrigin", "transform", "visible"];

// Told that the element under one of its children is another, an item puts
// its children's elements in order again.
const told = (parent: QObject | null | undefined) => parent?.$touch?.((version) => version + 1);

export function layered(item: QObject, props: Props): void {
  const self = item as Layered;
  if (!("layer$enabled" in props || "layer$effect" in props)) return;
  let given: QObject | null = null;
  let made: Made | null = null;
  // What the effect that is there was made of, and the one that is to be.
  let last: readonly unknown[] = [];
  let wanted: object | null = null;
  const drop = () => {
    wanted = null;
    if (!made) return;
    const { object, dispose, parent } = made;
    made = null;
    self.$layerEffect = null;
    object?.$node?.remove();
    dispose();
    told(parent);
  };
  const make = (component: Make, parent: QObject | null | undefined, name: string) => {
    given ??= source(self);
    // It has its source before it is complete, as in Qt.
    const sourced = (data?: Props) => {
      const object = component(data);
      if (object && name in object) (object as Dynamic)[name] = given;
      return object;
    };
    made = { ...instantiate(sourced, {} as Props, parent ?? null, self.$owner), parent };
    if (!made.object?.$node) drop();
  };
  const place = () => {
    if (!made) return;
    const { parent } = made;
    const object = made.object!;
    for (const name of MIRRORED) slot(object, name)!.write(self[name]);
    if (self.$layerEffect === object.$node) return;
    self.$layerEffect = object.$node;
    told(parent);
  };
  effect(
    () => {
      const { enabled, effect: component, samplerName } = self.layer as Dynamic & { enabled: boolean };
      for (const name of MIRRORED) self[name];
      return [enabled && typeof component === "function" ? (component as Make) : null, self.parent, String(samplerName)] as const;
    },
    ([component, parent, name]) => {
      if (component !== last[0] || parent !== last[1] || name !== last[2]) {
        drop();
        last = [component, parent, name];
        if (component) {
          const mine = (wanted = {});
          whenHeld(() => {
            if (wanted !== mine) return;
            make(component, parent, name);
            place();
            settle();
          });
        }
      }
      untrack(place);
    },
  );
  onCleanup(drop);
}
