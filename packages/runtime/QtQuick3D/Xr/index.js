// QtQuick3D.Xr: a scene one stands in, seen through a headset and reached
// into with what the hands hold.
//
// A page has no headset until the browser gives it one, so an XrView here
// is the scene seen from where the head would be, in the element it is
// mounted in: what a person standing at the origin and looking ahead sees.
// Nothing is tracked: the camera stays there, no controller is active and no
// action is ever pressed, so what a program does with them it does not do.
//
// Not here: a session in a headset (WebXR), an XrItem's content, hands,
// anchors, passthrough, and `rayPick`, which finds what View3D's `pick`
// finds: nothing.
import { onCleanup } from "solid-js";
import { defineType, derived, effect, flush, inside as within, QtObject, slot } from "../../object.js";
import * as math from "../math.js";
import { inside, Node } from "../Node.js";
import { Camera, Model } from "../scene.js";
import { View3D } from "../View3D.js";
import { untrack } from "#kernel";

// How high the eyes of someone standing are, a unit being a centimetre,
// and how much they see up and down, in degrees.
const EYES = 160;
const SEEN = 70;

const ReferenceSpaceUnknown = 0;
const ReferenceSpaceLocal = 1;
const ReferenceSpaceStage = 2;
const ReferenceSpaceLocalFloor = 3;

// The view a node is in.
function viewOf(node) {
  for (let above = node.parent; above; above = above.parent) if (above.$xr) return above;
  return null;
}

// What a property holds is in the node that holds it, unless it is already
// somewhere: `camera: XrCamera {}` in an origin moves with the origin.
function adopting(self, name) {
  effect(
    () => self[name],
    (held) => {
      if (held?.$spatial && !untrack(() => held.parent)) slot(held, "parent").provide(self);
    },
  );
}

// The head: where it is is the headset's to say, not the program's. Spaces
// that begin at the floor have it at eye height, the others where it was
// when the session began, which is the origin.
export const XrCamera = defineType("XrCamera", Camera, {
  properties: {
    clipNear: 1,
    clipFar: 10000,
    y: derived((self) => {
      const space = viewOf(self)?.referenceSpace;
      return space === ReferenceSpaceStage || space === ReferenceSpaceLocalFloor ? EYES : 0;
    }),
  },
  methods: {
    $projection(width, height) {
      return math.perspective(SEEN, height > 0 ? width / height : 1, this.clipNear, this.clipFar);
    },
  },
  setup(self) {
    self.$camera = true;
  },
});

// Where the space the headset tracks begins: moving it moves the person.
export const XrOrigin = defineType("XrOrigin", Node, {
  properties: { camera: null },
  setup(self) {
    adopting(self, "camera");
  },
});

const NOWHERE = () => ({ x: 0, y: 0, z: 0 });

const ControllerLeft = 0;
const ControllerRight = 1;
const ControllerNone = 2;
const CONTROLLERS = {
  ControllerLeft,
  ControllerRight,
  ControllerNone,
  LeftController: ControllerLeft,
  RightController: ControllerRight,
  UnknownController: ControllerNone,
  LeftHand: ControllerLeft,
  RightHand: ControllerRight,
};

const GripPose = 0;
const AimPose = 1;

// What a hand holds, where the hand is. There is none, which Qt would only
// say once a session had looked for one.
export const XrController = defineType("XrController", Node, {
  properties: {
    controller: ControllerNone,
    poseSpace: AimPose,
    isActive: derived(() => false),
    pokePosition: derived(NOWHERE),
    jointPositions: derived(() => []),
    jointRotations: derived(() => []),
  },
  signals: ["jointDataUpdated"],
  enums: { ...CONTROLLERS, GripPose, AimPose },
});

const ACTIONS = [
  "CustomAction",
  "Button1Pressed",
  "Button1Touched",
  "Button2Pressed",
  "Button2Touched",
  "ButtonMenuPressed",
  "ButtonMenuTouched",
  "ButtonSystemPressed",
  "ButtonSystemTouched",
  "SqueezeValue",
  "SqueezeForce",
  "SqueezePressed",
  "TriggerValue",
  "TriggerPressed",
  "TriggerTouched",
  "ThumbstickX",
  "ThumbstickY",
  "ThumbstickPressed",
  "ThumbstickTouched",
  "ThumbrestTouched",
  "TrackpadX",
  "TrackpadY",
  "TrackpadForce",
  "TrackpadTouched",
  "TrackpadPressed",
  "IndexFingerPinch",
  "MiddleFingerPinch",
  "RingFingerPinch",
  "LittleFingerPinch",
  "HandTrackingMenuPress",
];

// A button, a trigger or a stick of a controller: how far it is pushed and
// whether that counts as pressed.
export const XrInputAction = defineType("XrInputAction", QtObject, {
  properties: {
    value: derived(() => 0),
    pressed: derived(() => false),
    actionName: "",
    actionId: [],
    enabled: true,
    hand: 0,
    controller: 0,
  },
  signals: ["triggered"],
  enums: {
    LeftHand: 0,
    RightHand: 1,
    Unknown: 2,
    LeftController: 0,
    RightController: 1,
    UnknownController: 2,
    CustomAction: -1,
    ...Object.fromEntries(ACTIONS.slice(1).map((name, index) => [name, index])),
    NumHandActions: ACTIONS.length - 1,
    NumActions: ACTIONS.length,
  },
});

// A flat item standing in the scene.
export const XrItem = defineType("XrItem", Node, {
  properties: {
    contentItem: null,
    pixelsPerUnit: 1,
    manualPixelsPerUnit: false,
    automaticHeight: false,
    automaticWidth: false,
    width: 0,
    height: 0,
    color: "#ffffff",
  },
});

// A hand as the headset sees it. It sees none, and none is drawn.
export const XrHandModel = defineType("XrHandModel", Model, {
  properties: { hand: 2 },
  enums: { LeftHand: 0, RightHand: 1, Unknown: 2 },
  methods: { updatePose() {} },
});

export const XrHapticEffect = defineType("XrHapticEffect", QtObject, {});

export const XrSimpleHapticEffect = defineType("XrSimpleHapticEffect", XrHapticEffect, {
  properties: { amplitude: 0.5, duration: 30, frequency: 3000 },
});

// A controller that shakes: there is none to shake.
export const XrHapticFeedback = defineType("XrHapticFeedback", QtObject, {
  properties: { controller: 2, hapticEffect: null, trigger: false, condition: 0 },
  enums: { LeftController: 0, RightController: 1, UnknownController: 2, RisingEdge: 0, TrailingEdge: 1 },
  methods: { start() {}, stop() {} },
});

export const XrVirtualMouse = defineType("XrVirtualMouse", QtObject, {
  properties: {
    rightMouseButton: false,
    leftMouseButton: false,
    middleMouseButton: false,
    scrollWheelX: 0,
    scrollWheelY: 0,
    scrollTimerInterval: 30,
    scrollPixelDelta: 15,
    source: null,
    view: null,
    enabled: true,
  },
});

const RUNTIME = { enabledExtensions: [], runtimeName: "", runtimeVersion: "", graphicsApiName: "WebGL" };

const MISSED = () => ({
  objectHit: null,
  itemHit: null,
  distance: 0,
  instanceIndex: -1,
  hitType: 0,
  uvPosition: { x: 0, y: 0 },
  uvPosition1: { x: 0, y: 0 },
  scenePosition: NOWHERE(),
  position: NOWHERE(),
  normal: NOWHERE(),
  sceneNormal: NOWHERE(),
});

// The scene and the way into it: a node, whose children are the scene. The
// origin, wherever it is declared, is in it.
export const XrView = defineType("XrView", Node, {
  properties: {
    xrOrigin: null,
    environment: null,
    passthroughSupported: derived(() => false),
    passthroughEnabled: false,
    runtimeInfo: derived(() => RUNTIME),
    quitOnSessionEnd: true,
    renderStats: derived(() => null),
    fixedFoveation: 3,
    referenceSpace: ReferenceSpaceLocal,
    depthSubmissionEnabled: false,
    multiViewRenderingSupported: derived(() => false),
    multiViewRenderingEnabled: false,
  },
  signals: ["initializeFailed", "sessionEnded", "frameReady"],
  enums: {
    NoFoveation: 0,
    LowFoveation: 1,
    MediumFoveation: 2,
    HighFoveation: 3,
    ReferenceSpaceUnknown,
    ReferenceSpaceLocal,
    ReferenceSpaceStage,
    ReferenceSpaceLocalFloor,
  },
  methods: {
    rayPick: MISSED,
    rayPickAll: () => [],
    closestPointPick: MISSED,
    setTouchpoint() {},
    processTouch: NOWHERE,
    touchpointState: () => ({ grabbed: false, target: null, pressed: false, cursorPosition: { x: 0, y: 0 }, touchDistance: 0 }),
    // Called by `mount`: with no window of its own, what the scene is seen
    // in is as big as what it was put in.
    $mounted(host) {
      const measure = () => {
        slot(this.$seen, "width").provide(host.clientWidth);
        slot(this.$seen, "height").provide(host.clientHeight);
        flush();
      };
      const observer = new ResizeObserver(measure);
      observer.observe(host);
      onCleanup(() => observer.disconnect());
      measure();
    },
  },
  setup(self) {
    self.$xr = true;
    adopting(self, "xrOrigin");
    // An origin with no camera is seen from where it is all the same.
    const head = within(self, () => XrCamera({}));
    // What is drawn: the view and the origin, under a node of their own.
    const stage = within(null, () => Node({}));
    Object.defineProperties(stage, {
      $static: {
        get() {
          const origin = self.xrOrigin;
          return origin && !inside(self).includes(origin) ? [self, origin] : [self];
        },
      },
    });
    self.$seen = within(null, () =>
      View3D({
        importScene: stage,
        get camera() {
          return self.xrOrigin?.camera ?? head;
        },
        get environment() {
          return self.environment;
        },
      }),
    );
    self.$node = self.$seen.$node;
  },
});
