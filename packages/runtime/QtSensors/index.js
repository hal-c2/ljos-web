// `import QtSensors`: what the device feels, as the browser tells it.
//
// A browser tells how a device is moved (`devicemotion`): how it is pushed,
// the pull of the Earth in that or not, and how fast it turns. An
// Accelerometer and a Gyroscope read that while they are `active`. Where
// there is nothing to feel with (a desk) the browser tells nothing, and the
// reading stays what it was: Qt has no sensor there at all, and its
// `active` is false. Where a browser asks the person first (Safari), it is
// asked when the sensor starts, and granted only from a tap.
//
// Not here: the other sensors Qt has (light, pressure, compass, tilt...),
// which are named and say so when used; `axesOrientationMode`, the buffers
// and the output ranges, which are kept and do nothing.
import { onCleanup } from "solid-js";
import { defineType, derived, QtObject, settle, slot, whenComplete } from "../object.js";
import { untrack } from "#kernel";

const MOTION = "devicemotion";
const backend = () => typeof DeviceMotionEvent !== "undefined";

const Combined = 0;
const Gravity = 1;
const User = 2;

export const SensorReading = defineType("SensorReading", QtObject, {
  // In microseconds, from when the page was opened.
  properties: { timestamp: 0 },
});

const along = (name) => defineType(name, SensorReading, { properties: { x: 0, y: 0, z: 0 } });

// In metres a second, each second.
export const AccelerometerReading = along("AccelerometerReading");
// In degrees a second.
export const GyroscopeReading = along("GyroscopeReading");

function write(self, name, value) {
  slot(self, name).write(value);
  settle();
}

function received(self, event) {
  const rate = untrack(() => self.dataRate);
  // No more often than it was asked to tell, give or take a frame's wobble.
  if (rate > 0 && self.$last !== null && event.timeStamp - self.$last < 1000 / rate - 1) return;
  const values = self.$read(event);
  if (!values) return;
  const reading = self.$reading;
  const same = untrack(() => values.every((value, index) => value === reading["xyz"[index]]));
  if (same && self.$last !== null && untrack(() => self.skipDuplicates)) return;
  self.$last = event.timeStamp;
  slot(reading, "timestamp").write(Math.round(event.timeStamp * 1000));
  values.forEach((value, index) => slot(reading, "xyz"[index]).write(value));
  settle();
  self.readingChanged();
  settle();
}

function begin(self) {
  self.$listener = (event) => received(self, event);
  self.$last = null;
  window.addEventListener(MOTION, self.$listener);
  // Granted or not, there is nothing more to do than listen.
  DeviceMotionEvent.requestPermission?.().catch(() => {});
}

function end(self) {
  if (self.$listener) window.removeEventListener(MOTION, self.$listener);
  self.$listener = null;
}

export const Sensor = defineType("Sensor", QtObject, {
  properties: {
    active: false,
    alwaysOn: false,
    skipDuplicates: false,
    dataRate: 0,
    identifier: derived(() => (backend() ? MOTION : "")),
    type: derived((self) => self.$sensor ?? ""),
    connectedToBackend: derived(() => backend()),
    availableDataRates: derived(() => []),
    outputRanges: derived(() => []),
    outputRange: -1,
    description: "",
    busy: false,
    error: 0,
    axesOrientationMode: 0,
    currentOrientation: 0,
    userOrientation: 0,
    maxBufferSize: 1,
    efficientBufferSize: 1,
    bufferSize: 1,
  },
  // `reading` is one object for as long as the sensor: what changes is in
  // it, and this tells of every new one.
  signals: ["readingChanged"],
  enums: {
    FixedOrientation: 0,
    AutomaticOrientation: 1,
    UserOrientation: 2,
    Buffering: 0,
    AlwaysOn: 1,
    GeoValues: 2,
    FieldOfView: 3,
    AccelerationMode: 4,
    SkipDuplicates: 5,
    AxesOrientation: 6,
    PressureSensorTemperature: 7,
  },
  methods: {
    get reading() {
      return this.$reading ?? null;
    },
    // As assigning to `active`, which they do: a binding of it is over.
    start() {
      write(this, "active", backend() && Boolean(this.$read));
      return this.active;
    },
    stop() {
      write(this, "active", false);
    },
    isFeatureSupported(feature) {
      return this.$features?.includes(feature) ?? false;
    },
  },
  setup(self) {
    self.$listener = null;
    self.$last = null;
    onCleanup(() => end(self));
    // It listens while it is active, whatever made it so: and is not
    // active where there is nothing to listen to.
    const follow = () => {
      const active = Boolean(untrack(() => self.active));
      if (active === Boolean(self.$listener)) return;
      if (!active) end(self);
      else if (backend() && self.$read) begin(self);
      else write(self, "active", false);
    };
    self.activeChanged.connect(follow);
    whenComplete(follow);
  },
});

// A browser with nothing to feel with tells of nothing, once: no reading.
const felt = (values) => (values.every((value) => typeof value === "number") ? values : null);
const three = (given) => (given ? felt([given.x, given.y, given.z]) : null);

export const Accelerometer = defineType("Accelerometer", Sensor, {
  properties: { accelerationMode: Combined },
  enums: { Combined, Gravity, User },
  setup(self) {
    self.$sensor = "QAccelerometer";
    self.$features = [5, 4];
    self.$reading = AccelerometerReading({});
    self.$read = (event) => {
      const mode = untrack(() => self.accelerationMode);
      if (mode === User) return three(event.acceleration);
      const all = three(event.accelerationIncludingGravity);
      if (mode === Combined) return all;
      // The pull of the Earth is what is left without the push.
      const pushed = three(event.acceleration);
      return all && pushed ? all.map((value, index) => value - pushed[index]) : null;
    };
  },
});

export const Gyroscope = defineType("Gyroscope", Sensor, {
  setup(self) {
    self.$sensor = "QGyroscope";
    self.$features = [5];
    self.$reading = GyroscopeReading({});
    // A browser names the turns by the angles they change: about the
    // device's across, its along and its out.
    self.$read = ({ rotationRate: rate }) => (rate ? felt([rate.beta, rate.gamma, rate.alpha]) : null);
  },
});

const TYPES = ["QAccelerometer", "QGyroscope"];

export const QmlSensors = {
  sensorTypes: () => (backend() ? [...TYPES] : []),
  sensorsForType: (type) => (backend() && TYPES.includes(type) ? [MOTION] : []),
  defaultSensorForType: (type) => (backend() && TYPES.includes(type) ? MOTION : ""),
};
