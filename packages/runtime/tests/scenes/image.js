// Item {
//     id: root; width: 400; height: 300
//     Image { id: stretch; width: 100; height: 100; source: "/assets/flag.png" }
//     Image { id: fit; x: 100; width: 100; height: 100; source: "/assets/flag.png"; fillMode: Image.PreserveAspectFit }
//     Image { id: crop; x: 200; width: 100; height: 100; source: "/assets/flag.png"; fillMode: Image.PreserveAspectCrop }
//     Image { id: tile; x: 300; width: 100; height: 100; source: "/assets/flag.png"; fillMode: Image.Tile }
//     Image { id: tileV; y: 100; width: 100; height: 100; source: "/assets/flag.png"; fillMode: Image.TileVertically }
//     Image { id: tileH; x: 100; y: 100; width: 100; height: 100; source: "/assets/flag.png"; fillMode: Image.TileHorizontally }
//     Image { id: pad; x: 200; y: 100; width: 100; height: 100; source: "/assets/flag.png"; fillMode: Image.Pad }
//     Image {
//         id: corner; x: 300; y: 100; width: 100; height: 100; source: "/assets/flag.png"; fillMode: Image.Pad
//         horizontalAlignment: Image.AlignLeft; verticalAlignment: Image.AlignBottom
//     }
//     Image { id: plain; y: 200; source: "/assets/flag.png" }
//     Image { id: mirrored; x: 50; y: 200; source: "/assets/flag.png"; mirror: true }
//     Image { id: small; x: 100; y: 200; source: "/assets/flag.png"; sourceSize.width: 20 }
//     Image { id: blocky; x: 130; y: 200; width: 80; height: 40; source: "/assets/flag.png"; smooth: false; cache: false }
//     Image { id: wide; x: 220; y: 200; width: 100; source: "/assets/flag.png"; fillMode: Image.PreserveAspectFit }
//     Image { id: vector; y: 230; source: "/assets/disc.svg"; sourceSize.width: 120; asynchronous: true }
//     Image { id: drawn; x: 130; y: 250; source: "/assets/disc.svg" }
//     Image { id: packed; x: 330; y: 200; source: "/assets/disc.svgz" }
//     Image { id: misnamed; x: 355; y: 250; source: "/assets/flagged.svg" }
//     Image { id: misnamedWide; x: 355; y: 275; source: "/assets/flagged.svg"; sourceSize.width: 120 }
//     Image { id: broken; source: "data:image/png;base64,AAAA" }
//     Image { id: none }
//     BorderImage {
//         id: frame; x: 250; y: 230; width: 100; height: 60; source: "/assets/frame.png"
//         border { left: 10; top: 10; right: 10; bottom: 10 }
//     }
// }
import { $object } from "ljos-web/object";
import { BorderImage, Image, Item } from "ljos-web/QtQuick";
import { make } from "../scene.js";

export const objects = {};

const flag = "/assets/flag.png";
const disc = "/assets/disc.svg";

export default function Pictures() {
  const named = (Type, name, props) => make(Type, { $self: (objects[name] = $object()), ...props });
  const square = { width: 100, height: 100, source: flag };
  return make(Item, { $self: (objects.root = $object()), width: 400, height: 300 }, () => [
    named(Image, "stretch", { ...square }),
    named(Image, "fit", { ...square, x: 100, fillMode: Image.PreserveAspectFit }),
    named(Image, "crop", { ...square, x: 200, fillMode: Image.PreserveAspectCrop }),
    named(Image, "tile", { ...square, x: 300, fillMode: Image.Tile }),
    named(Image, "tileV", { ...square, y: 100, fillMode: Image.TileVertically }),
    named(Image, "tileH", { ...square, x: 100, y: 100, fillMode: Image.TileHorizontally }),
    named(Image, "pad", { ...square, x: 200, y: 100, fillMode: Image.Pad }),
    named(Image, "corner", {
      ...square,
      x: 300,
      y: 100,
      fillMode: Image.Pad,
      horizontalAlignment: Image.AlignLeft,
      verticalAlignment: Image.AlignBottom,
    }),
    named(Image, "plain", { y: 200, source: flag }),
    named(Image, "mirrored", { x: 50, y: 200, source: flag, mirror: true }),
    named(Image, "small", { x: 100, y: 200, source: flag, sourceSize$width: 20 }),
    named(Image, "blocky", { x: 130, y: 200, width: 80, height: 40, source: flag, smooth: false, cache: false }),
    named(Image, "wide", { x: 220, y: 200, width: 100, source: flag, fillMode: Image.PreserveAspectFit }),
    named(Image, "vector", { y: 230, source: disc, sourceSize$width: 120, asynchronous: true }),
    named(Image, "drawn", { x: 130, y: 250, source: disc }),
    named(Image, "packed", { x: 330, y: 200, source: "/assets/disc.svgz" }),
    // flag.png under a drawing's name.
    named(Image, "misnamed", { x: 355, y: 250, source: "/assets/flagged.svg" }),
    named(Image, "misnamedWide", { x: 355, y: 275, source: "/assets/flagged.svg", sourceSize$width: 120 }),
    named(Image, "broken", { source: "data:image/png;base64,AAAA" }),
    named(Image, "none", {}),
    named(BorderImage, "frame", {
      x: 250,
      y: 230,
      width: 100,
      height: 60,
      source: "/assets/frame.png",
      border$left: 10,
      border$top: 10,
      border$right: 10,
      border$bottom: 10,
    }),
  ]);
}
