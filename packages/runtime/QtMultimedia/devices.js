// MediaDevices: what there is to play sound on and to record with, as far
// as the browser tells a page that has not asked for a microphone or a
// camera: often one device of each kind, without a name.
import { defineType, derived, flush, QtObject } from "../object.js";
import { signal } from "#kernel";

const NULL = 0;
const INPUT = 1;
const OUTPUT = 2;

// The `audioDevice` value. One without an id is the browser's own choice.
export class AudioDevice {
  constructor(id = "", description = "", isDefault = false, mode = NULL) {
    this.id = id;
    this.description = description;
    this.isDefault = isDefault;
    this.mode = mode;
  }
}

// The `cameraDevice` value, as far as it goes without opening the camera.
class CameraDevice {
  constructor(id = "", description = "", isDefault = false) {
    this.id = id;
    this.description = description;
    this.isDefault = isDefault;
  }
}

const NO_AUDIO = Object.freeze(new AudioDevice());
const NO_CAMERA = Object.freeze(new CameraDevice());
const NONE = Object.freeze([]);
const KINDS = ["audioinput", "audiooutput", "videoinput"];

const [known, setKnown] = signal({ audioinput: NONE, audiooutput: NONE, videoinput: NONE });
let watching = false;

const same = (a, b) =>
  a.length === b.length &&
  a.every((device, index) => device.id === b[index].id && device.description === b[index].description);

function value(info, first) {
  // Chromium lists the default once more under the id "default".
  const isDefault = info.deviceId === "default" || first;
  if (info.kind === "videoinput") return new CameraDevice(info.deviceId, info.label, isDefault);
  return new AudioDevice(info.deviceId, info.label, isDefault, info.kind === "audioinput" ? INPUT : OUTPUT);
}

async function enumerate() {
  let infos;
  try {
    infos = await navigator.mediaDevices.enumerateDevices();
  } catch {
    return;
  }
  const before = known();
  const now = {};
  for (const kind of KINDS) {
    const devices = infos.filter((info) => info.kind === kind).map((info, index) => value(info, index === 0));
    // A list that is as it was stays the same list: nothing is told of it.
    now[kind] = same(devices, before[kind]) ? before[kind] : devices;
  }
  if (KINDS.every((kind) => now[kind] === before[kind])) return;
  setKnown(now);
  flush();
}

// The lists are asked for when something first wants them, and again
// whenever the browser says they changed.
function devices(kind) {
  if (!watching) {
    watching = true;
    const source = navigator.mediaDevices;
    if (source?.enumerateDevices) {
      source.addEventListener?.("devicechange", enumerate);
      enumerate();
    }
  }
  return known()[kind];
}

const preferred = (list, none) => list.find((device) => device.isDefault) ?? list[0] ?? none;

export const MediaDevices = defineType("MediaDevices", QtObject, {
  properties: {
    audioInputs: derived(() => devices("audioinput")),
    audioOutputs: derived(() => devices("audiooutput")),
    videoInputs: derived(() => devices("videoinput")),
    defaultAudioInput: derived((self) => preferred(self.audioInputs, NO_AUDIO)),
    defaultAudioOutput: derived((self) => preferred(self.audioOutputs, NO_AUDIO)),
    defaultVideoInput: derived((self) => preferred(self.videoInputs, NO_CAMERA)),
  },
});

// What plays a MediaPlayer's sound, and how loud.
export const AudioOutput = defineType("AudioOutput", QtObject, {
  properties: {
    volume: 1,
    muted: false,
    device: NO_AUDIO,
  },
  methods: {
    setVolume(volume) {
      this.volume = volume;
    },
    setMuted(muted) {
      this.muted = muted;
    },
    setDevice(device) {
      this.device = device;
    },
  },
});
