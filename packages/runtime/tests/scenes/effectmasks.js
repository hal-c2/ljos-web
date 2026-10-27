// MultiEffect's mask: what is shown of a source is what the mask is not
// clear in.
//
// component Block: Rectangle { width: 40; height: 40; color: "#336699"; visible: false }
// component Wide: Rectangle { width: 100; height: 40; color: "#336699"; visible: false }
// component Masked: MultiEffect { maskEnabled: true }
//
// Item {
//     id: root; width: 400; height: 300
//     Image { id: circle; source: "/assets/circle.png"; visible: false }
//     Image { id: fade; source: "/assets/fade.png"; visible: false }
//     Rectangle { id: pill; width: 40; height: 40; radius: 20; visible: false; layer.enabled: true }
//     Rectangle { id: dot; width: 20; height: 20; radius: 10; color: "#80000000"; visible: false
//                 layer.enabled: true }
//     Item { id: other; width: 40; height: 40; visible: false; layer.enabled: true }
//
//     Block { id: b0; x: 10; y: 10 } Masked { id: round; source: b0; anchors.fill: b0; maskSource: circle }
//     Block { id: b1; x: 60; y: 10 } Masked { id: hole; source: b1; anchors.fill: b1; maskSource: circle
//                                             maskInverted: true }
//     Block { id: b2; x: 110; y: 10 } Masked { id: shaped; source: b2; anchors.fill: b2; maskSource: pill }
//     Block { id: b3; x: 160; y: 10 } Masked { id: small; source: b3; anchors.fill: b3; maskSource: dot }
//     Block { id: b4; x: 210; y: 10 } MultiEffect { id: off; source: b4; anchors.fill: b4; maskSource: circle }
//     Block { id: b5; x: 260; y: 10; visible: true }
//     Masked { id: shown; source: b5; anchors.fill: b5; maskSource: circle }
//     Block { id: b6; x: 310; y: 10 } Masked { id: unknown; source: b6; anchors.fill: b6; maskSource: other }
//
//     Wide { id: w0; x: 10; y: 70 } Masked { id: faded; source: w0; anchors.fill: w0; maskSource: fade }
//     Wide { id: w1; x: 130; y: 70 } Masked { id: upper; source: w1; anchors.fill: w1; maskSource: fade
//                                             maskThresholdMin: 0.5 }
//     Wide { id: w2; x: 250; y: 70 } Masked { id: lower; source: w2; anchors.fill: w2; maskSource: fade
//                                             maskThresholdMax: 0.5 }
//     Wide { id: w3; x: 10; y: 130 } Masked { id: rising; source: w3; anchors.fill: w3; maskSource: fade
//                                             maskThresholdMin: 0.5; maskSpreadAtMin: 0.5 }
//     Wide { id: w4; x: 130; y: 130 } Masked { id: falling; source: w4; anchors.fill: w4; maskSource: fade
//                                              maskThresholdMax: 0.5; maskSpreadAtMax: 0.5 }
//     Wide { id: w5; x: 250; y: 130 } Masked { id: band; source: w5; anchors.fill: w5; maskSource: fade
//                                              maskThresholdMin: 0.3; maskSpreadAtMin: 0.2
//                                              maskThresholdMax: 0.8; maskSpreadAtMax: 0.4; maskInverted: true }
// }
import { $object } from "ljos-web/object";
import { Image, Item, Rectangle } from "ljos-web/QtQuick";
import { MultiEffect } from "ljos-web/QtQuick/Effects";
import { make } from "../scene.js";

export const objects = {};

const named = (name) => (objects[name] = $object());

export default function EffectMasks() {
  const o = objects;
  // A hidden source and the effect that shows it, in the same place.
  const masked = (source, name, size, at, { given, ...props }) => [
    make(Rectangle, { $self: named(source), ...size, ...at, color: "#336699", visible: false, ...given }),
    make(MultiEffect, { $self: named(name), source: o[source], anchors$fill: o[source], maskEnabled: true, ...props }),
  ];
  const block = { width: 40, height: 40 };
  const wide = { width: 100, height: 40 };
  return make(Item, { $self: named("root"), width: 400, height: 300 }, () => [
    make(Image, { $self: named("circle"), source: "/assets/circle.png", visible: false }),
    make(Image, { $self: named("fade"), source: "/assets/fade.png", visible: false }),
    make(Rectangle, { $self: named("pill"), ...block, radius: 20, visible: false, layer$enabled: true }),
    make(Rectangle, {
      $self: named("dot"),
      width: 20,
      height: 20,
      radius: 10,
      color: "#80000000",
      visible: false,
      layer$enabled: true,
    }),
    make(Item, { $self: named("other"), ...block, visible: false, layer$enabled: true }),

    ...masked("b0", "round", block, { x: 10, y: 10 }, { maskSource: o.circle }),
    ...masked("b1", "hole", block, { x: 60, y: 10 }, { maskSource: o.circle, maskInverted: true }),
    ...masked("b2", "shaped", block, { x: 110, y: 10 }, { maskSource: o.pill }),
    ...masked("b3", "small", block, { x: 160, y: 10 }, { maskSource: o.dot }),
    ...masked("b4", "off", block, { x: 210, y: 10 }, { maskSource: o.circle, maskEnabled: false }),
    ...masked("b5", "shown", block, { x: 260, y: 10 }, { maskSource: o.circle, given: { visible: true } }),
    ...masked("b6", "unknown", block, { x: 310, y: 10 }, { maskSource: o.other }),

    ...masked("w0", "faded", wide, { x: 10, y: 70 }, { maskSource: o.fade }),
    ...masked("w1", "upper", wide, { x: 130, y: 70 }, { maskSource: o.fade, maskThresholdMin: 0.5 }),
    ...masked("w2", "lower", wide, { x: 250, y: 70 }, { maskSource: o.fade, maskThresholdMax: 0.5 }),
    ...masked(
      "w3",
      "rising",
      wide,
      { x: 10, y: 130 },
      { maskSource: o.fade, maskThresholdMin: 0.5, maskSpreadAtMin: 0.5 },
    ),
    ...masked(
      "w4",
      "falling",
      wide,
      { x: 130, y: 130 },
      { maskSource: o.fade, maskThresholdMax: 0.5, maskSpreadAtMax: 0.5 },
    ),
    ...masked(
      "w5",
      "band",
      wide,
      { x: 250, y: 130 },
      {
        maskSource: o.fade,
        maskThresholdMin: 0.3,
        maskSpreadAtMin: 0.2,
        maskThresholdMax: 0.8,
        maskSpreadAtMax: 0.4,
        maskInverted: true,
      },
    ),
  ]);
}
