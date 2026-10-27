// Item {
//     id: root; width: 400; height: 300
//     SystemPalette { id: active }
//     SystemPalette { id: disabled; colorGroup: SystemPalette.Disabled }
//     Palette { id: plain }
//     Palette { id: tinted; button: "red"; disabled.text: "blue" }
//     ColorGroup { id: group; window: "#123456" }
//     Rectangle { id: painted; width: 10; height: 10; color: active.highlight }
// }
//
// `follower` is a palette as an item has one: it follows another (its
// parent's) and answers for the group the item is in.
import { createSignal } from "solid-js";
import { $object, QtObject } from "ljos-web/object";
import { ColorGroup, Item, Palette, Rectangle, SystemPalette } from "ljos-web/QtQuick";
import { make } from "../scene.js";

export const objects = { SystemPalette };

export default function Palettes() {
  const root = (objects.root = $object());
  const active = (objects.active = $object());
  const disabled = (objects.disabled = $object());
  const plain = (objects.plain = $object());
  const tinted = (objects.tinted = $object());
  const group = (objects.group = $object());
  const painted = (objects.painted = $object());
  const follower = (objects.follower = $object());
  const [inGroup, setGroup] = createSignal("active", { ownedWrite: true });
  objects.setGroup = setGroup;
  return make(Item, { $self: root, width: 400, height: 300 }, () => {
    const made = [
      make(SystemPalette, { $self: active }),
      make(SystemPalette, { $self: disabled, colorGroup: SystemPalette.Disabled }),
      make(Palette, { $self: plain }),
      make(Palette, { $self: tinted, button: "red", disabled$text: "blue" }),
      make(ColorGroup, { $self: group, window: "#123456" }),
      make(Rectangle, {
        $self: painted,
        width: 10,
        height: 10,
        get color() {
          return active.highlight;
        },
      }),
      make(Palette, { $self: follower, window: "#00ff00" }),
    ];
    follower.$from = () => tinted;
    follower.$group = inGroup;
    return made;
  });
}
