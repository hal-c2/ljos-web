// SoundEffect: a short sound, played at once and as often as asked.
//
// The file is fetched and decoded once for every effect that names it, and
// played by Web Audio, so any number of effects sound at the same time. How
// long a play lasts is counted on the clock, not asked of the browser: a
// page that may not make sound yet plays it silently, and is as far along
// as it would have been when the sound comes on.
import { onCleanup } from "solid-js";
import { defineType, effect, onChange, QtObject, settle, slot } from "../object.js";
import { clock } from "../QtQuick/animation/clock.js";
import { audible, whenAudible } from "./audible.js";
import { untrack } from "#kernel";

const NULL = 0;
const LOADING = 1;
const READY = 2;
const ERROR = 3;
const INFINITE = -2;

const href = (source) => (source ? String(source) : "");
const write = (self, name, value) => slot(self, name).write(value);

// What plays the sounds. One made before the user has done anything starts
// suspended, and the browser says so in its console: it is made when sound
// is allowed.
let context = null;
function output() {
  if (!context && audible()) {
    const Context = window.AudioContext ?? window.webkitAudioContext;
    if (Context) context = new Context();
  }
  return context;
}

// Decoding needs no permission: a context that plays nothing does it.
let offline = null;
const decoder = () => context ?? (offline ??= new OfflineAudioContext(1, 1, 44100));

// The decoded sounds, by where they are from.
const sounds = new Map();
function fetched(url) {
  let sound = sounds.get(url);
  if (!sound) {
    sound = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(response.statusText);
        return response.arrayBuffer();
      })
      .then((bytes) => decoder().decodeAudioData(bytes));
    sounds.set(url, sound);
    // Not kept when it failed: the next effect to ask tries again.
    sound.catch(() => sounds.delete(url));
  }
  return sound;
}

// The effects that are playing, heard or not.
const sounding = new Set();
let joining = false;

// Has the effects that play silently heard once sound is allowed.
function join() {
  if (joining) return;
  joining = true;
  whenAudible(() => {
    joining = false;
    for (const self of sounding) if (!self.$sound.node) voice(self);
  });
}

// Plays the sound from where the effect has got to.
function voice(self) {
  const sound = self.$sound;
  const audio = output();
  if (!audio) {
    if (!audible()) join();
    return;
  }
  // Suspended by the browser since: asked to go on, which it may refuse.
  if (audio.state !== "running") audio.resume().catch(() => {});
  const node = audio.createBufferSource();
  const gain = audio.createGain();
  node.buffer = sound.buffer;
  gain.gain.value = sound.loud;
  node.connect(gain).connect(audio.destination);
  node.onended = () => {
    node.disconnect();
    gain.disconnect();
  };
  node.loop = sound.left !== 1;
  node.start(0, (sound.elapsed % sound.length) / 1000);
  if (sound.left > 1) node.stop(audio.currentTime + (sound.left * sound.length - sound.elapsed) / 1000);
  sound.node = node;
  sound.gain = gain;
}

function silence(self) {
  const sound = self.$sound;
  const { node } = sound;
  if (!node) return;
  sound.node = sound.gain = null;
  node.stop();
}

function start(self) {
  const sound = self.$sound;
  sound.queued = false;
  silence(self);
  sound.elapsed = 0;
  sound.left = untrack(() => self.loops);
  write(self, "loopsRemaining", sound.left);
  write(self, "playing", true);
  sounding.add(self);
  // Its time starts now, also when it was playing.
  clock.remove(sound.job);
  clock.add(sound.job);
  voice(self);
}

function ended(self) {
  const sound = self.$sound;
  sounding.delete(self);
  clock.remove(sound.job);
  sound.left = 0;
  write(self, "loopsRemaining", 0);
  write(self, "playing", false);
}

function halt(self) {
  const sound = self.$sound;
  sound.queued = false;
  if (!sounding.has(self)) return;
  silence(self);
  ended(self);
}

// The clock moved on: the effect is that much further.
function pass(self, delta) {
  const sound = self.$sound;
  sound.elapsed += delta;
  if (sound.elapsed < sound.length) return;
  if (sound.left === INFINITE) {
    sound.elapsed %= sound.length;
    return;
  }
  while (sound.elapsed >= sound.length) {
    if (sound.left <= 1) {
      // What is still sounding of it is left to finish.
      sound.node = sound.gain = null;
      return ended(self);
    }
    sound.elapsed -= sound.length;
    write(self, "loopsRemaining", --sound.left);
  }
}

function load(self, url) {
  const sound = self.$sound;
  halt(self);
  sound.url = url;
  sound.buffer = null;
  if (!url) return void write(self, "status", NULL);
  write(self, "status", LOADING);
  fetched(url).then(
    (buffer) => {
      if (sound.url !== url) return;
      sound.buffer = buffer;
      sound.length = Math.max(1, buffer.duration * 1000);
      write(self, "status", READY);
      settle();
      self.loadedChanged();
      // What was asked for while it was loading.
      if (sound.queued) start(self);
      settle();
    },
    () => {
      if (sound.url !== url) return;
      sound.queued = false;
      write(self, "status", ERROR);
      settle();
    },
  );
}

// `play()` may come right after `source` was assigned, before what follows
// the assignment has run.
function sync(self) {
  const url = href(untrack(() => self.source));
  if (url !== self.$sound.url) load(self, url);
}

export const SoundEffect = defineType("SoundEffect", QtObject, {
  properties: {
    source: "",
    loops: 1,
    volume: 1,
    muted: false,
    // What the effect tells, and nothing sets.
    status: NULL,
    playing: false,
    loopsRemaining: 0,
  },
  signals: ["loadedChanged", "loopCountChanged"],
  enums: { Null: NULL, Loading: LOADING, Ready: READY, Error: ERROR, Infinite: INFINITE },
  resolve: {
    // Qt plays once for 0, and takes no other number below 1.
    loops(self, own) {
      const loops = Math.trunc(Number(own()) || 0);
      return loops === INFINITE || loops >= 1 ? loops : 1;
    },
  },
  methods: {
    play() {
      sync(this);
      const sound = this.$sound;
      if (!sound.url) return;
      if (sound.buffer) start(this);
      // Played once it is loaded; one that failed to load says nothing.
      else sound.queued = untrack(() => this.status) === LOADING;
      settle();
    },
    stop() {
      halt(this);
      settle();
    },
  },
  setup(self) {
    const sound = (self.$sound = {
      url: "",
      buffer: null,
      // How long the sound is, how far the play is, both in milliseconds,
      // and how many times it is still to play, this one included.
      length: 1,
      elapsed: 0,
      left: 0,
      queued: false,
      loud: 1,
      node: null,
      gain: null,
      job: {
        skew: 0,
        idle: () => Math.max(0, sound.length - sound.elapsed),
        advance: (delta) => pass(self, delta),
      },
    });
    effect(
      () => href(self.source),
      (url) => {
        if (url !== sound.url) load(self, url);
      },
    );
    effect(
      () => (self.muted ? 0 : Math.min(1, Math.max(0, Number(self.volume) || 0))),
      (loud) => {
        sound.loud = loud;
        if (sound.gain) sound.gain.gain.value = loud;
      },
    );
    onChange(self, "loops", () => {
      // Qt counts anew from a number given while it plays.
      if (sounding.has(self)) {
        sound.left = self.loops;
        write(self, "loopsRemaining", sound.left);
        if (sound.node) {
          silence(self);
          voice(self);
        }
      }
      self.loopCountChanged();
    });
    onCleanup(() => {
      sound.url = "";
      halt(self);
    });
  },
});
