// PositionSource: where the device is, as the browser tells it.
//
// It watches while it is `active`, which asks the person at the browser
// whether the page may know. A browser tells of a place when it has one:
// `updateInterval` is how old the one it gives may be. What it knows nothing
// of (how fast the device climbs, where the compass points) is never valid.
import { onCleanup } from "solid-js";
import { defineType, derived, QtObject, settle, slot, whenComplete } from "../object.js";
import { coordinate, INVALID } from "./coordinate.js";
import { untrack } from "#kernel";

const SATELLITE = 0xff;
const ALL = -1;

const ACCESS = 0;
const UNKNOWN = 2;
const NO_ERROR = 3;
const TIMEOUT = 4;

// What a browser's refusal is in Qt's words; anything else is unknown.
const ERRORS = { 1: ACCESS, 3: TIMEOUT };

const NEVER = new Date(NaN);
const known = (name) => derived((self) => !Number.isNaN(self[name]));
const number = (value) => value ?? NaN;

export const Position = defineType("Position", QtObject, {
  properties: {
    coordinate: INVALID,
    timestamp: NEVER,
    speed: NaN,
    horizontalAccuracy: NaN,
    verticalAccuracy: NaN,
    direction: NaN,
    latitudeValid: derived((self) => self.coordinate.isValid),
    longitudeValid: derived((self) => self.coordinate.isValid),
    altitudeValid: derived((self) => !Number.isNaN(self.coordinate.altitude)),
    speedValid: known("speed"),
    horizontalAccuracyValid: known("horizontalAccuracy"),
    verticalAccuracyValid: known("verticalAccuracy"),
    directionValid: known("direction"),
    // A browser does not say.
    verticalSpeed: NaN,
    verticalSpeedValid: false,
    magneticVariation: NaN,
    magneticVariationValid: false,
    directionAccuracy: NaN,
    directionAccuracyValid: false,
  },
});

function write(self, name, value) {
  slot(self, name).write(value);
  settle();
}

// One answer was asked for and this is it, or why there is none: the source
// is active no longer, unless it watches too.
function answered(self) {
  if (!self.$single) return;
  self.$single = false;
  if (!self.$regular && untrack(() => self.active)) write(self, "active", false);
}

function received(self, { coords, timestamp }) {
  const position = self.$position;
  slot(position, "coordinate").write(coordinate(coords.latitude, coords.longitude, number(coords.altitude)));
  slot(position, "timestamp").write(new Date(timestamp));
  slot(position, "speed").write(number(coords.speed));
  slot(position, "horizontalAccuracy").write(number(coords.accuracy));
  slot(position, "verticalAccuracy").write(number(coords.altitudeAccuracy));
  slot(position, "direction").write(number(coords.heading));
  settle();
  self.positionChanged();
  settle();
  answered(self);
}

function failed(self, error) {
  write(self, "sourceError", ERRORS[error.code] ?? UNKNOWN);
  answered(self);
}

const precise = (self) => untrack(() => (self.preferredPositioningMethods & SATELLITE) !== 0);

function watch(self) {
  const geolocation = navigator.geolocation;
  if (self.$watch !== null) geolocation.clearWatch(self.$watch);
  self.$watch = geolocation.watchPosition(
    (position) => received(self, position),
    (error) => failed(self, error),
    { enableHighAccuracy: precise(self), maximumAge: Math.max(0, untrack(() => self.updateInterval)) },
  );
}

function begin(self) {
  if (!navigator.geolocation) return;
  self.$regular = true;
  watch(self);
}

function end(self) {
  if (self.$watch !== null) navigator.geolocation.clearWatch(self.$watch);
  self.$watch = null;
  self.$regular = false;
}

export const PositionSource = defineType("PositionSource", QtObject, {
  properties: {
    active: false,
    valid: derived(() => Boolean(navigator.geolocation)),
    updateInterval: 0,
    supportedPositioningMethods: derived(() => (navigator.geolocation ? ALL : 0)),
    preferredPositioningMethods: ALL,
    sourceError: NO_ERROR,
  },
  // `position` is one object for as long as the source: what changes is in
  // it, and this tells of every answer.
  signals: ["positionChanged"],
  enums: {
    NoPositioningMethods: 0,
    SatellitePositioningMethods: SATELLITE,
    NonSatellitePositioningMethods: ~SATELLITE,
    AllPositioningMethods: ALL,
    AccessError: ACCESS,
    ClosedError: 1,
    UnknownSourceError: UNKNOWN,
    NoError: NO_ERROR,
    UpdateTimeoutError: TIMEOUT,
  },
  methods: {
    get position() {
      return this.$position;
    },
    // As assigning to `active`, which they do: a binding of it is over.
    start() {
      if (!navigator.geolocation) return;
      begin(this);
      write(this, "active", true);
    },
    stop() {
      end(this);
      // An answer still asked for keeps it active until it is there.
      if (!this.$single) write(this, "active", false);
    },
    // One answer, where the device is now, within `timeout` milliseconds
    // if one is given: active until it is there.
    update(timeout = 0) {
      if (!navigator.geolocation) return;
      this.$single = true;
      write(this, "active", true);
      navigator.geolocation.getCurrentPosition(
        (position) => this.$single && received(this, position),
        (error) => this.$single && failed(this, error),
        { enableHighAccuracy: precise(this), timeout: timeout > 0 ? timeout : Infinity },
      );
    },
  },
  setup(self) {
    self.$position = Position({});
    self.$watch = null;
    // Whether it watches, and whether one answer was asked for.
    self.$regular = false;
    self.$single = false;
    onCleanup(() => {
      self.$single = false;
      end(self);
    });
    // It watches while it is active, whatever made it so.
    const follow = () => {
      const active = Boolean(untrack(() => self.active));
      if (active === (self.$regular || self.$single)) return;
      if (active) begin(self);
      else end(self);
    };
    // What it is to watch with has changed: it watches anew.
    const again = () => {
      if (self.$regular) watch(self);
    };
    self.activeChanged.connect(follow);
    self.updateIntervalChanged.connect(again);
    self.preferredPositioningMethodsChanged.connect(again);
    whenComplete(follow);
  },
});
