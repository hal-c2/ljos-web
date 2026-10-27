// Item {
//     id: root; width: 400; height: 300
//     AnimatedImage { id: blink; source: "/assets/blink.gif" }
//     AnimatedImage { id: stopped; x: 20; source: "/assets/blink.gif"; playing: false }
//     AnimatedImage { id: held; x: 40; source: "/assets/blink.gif"; paused: true }
//     AnimatedImage { id: large; x: 60; width: 40; height: 40; source: "/assets/blink.gif"; speed: 2 }
//     AnimatedImage { id: none; x: 120 }
// }
import { $object } from "ljos-web/object";
import { AnimatedImage, clock, Item } from "ljos-web/QtQuick";
import { make } from "../scene.js";

// The clock stands still: a test moves it.
clock.stop();

export const objects = { clock };

const blink = "/assets/blink.gif";

export default function Animated() {
  const named = (name, props) => make(AnimatedImage, { $self: (objects[name] = $object()), ...props });
  return make(Item, { $self: (objects.root = $object()), width: 400, height: 300 }, () => [
    named("blink", { source: blink }),
    named("stopped", { x: 20, source: blink, playing: false }),
    named("held", { x: 40, source: blink, paused: true }),
    named("large", { x: 60, width: 40, height: 40, source: blink, speed: 2 }),
    named("none", { x: 120 }),
  ]);
}
