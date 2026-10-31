// MediaPlayer: a sound or a film, played by the browser's own media element.
//
// The element loads, decodes and keeps time. What is here is Qt's account of
// it: the states a player goes through, and the order it tells of them in,
// which is the order Qt 6.11 does.
import { onCleanup } from "solid-js";
import { defineType, effect, QtObject, settle, slot } from "../object.js";
import { Size } from "../QtQml/values.js";
import { clock } from "../QtQuick/animation/clock.js";
import { audible, whenAudible } from "./audible.js";
import { MediaMetaData, MetaData } from "./metadata.js";
import { signal, untrack } from "#kernel";

const next = (version) => version + 1;
const NONE = Object.freeze([]);

const STOPPED = 0;
const PLAYING = 1;
const PAUSED = 2;

const NO_MEDIA = 0;
const LOADING = 1;
const LOADED = 2;
const STALLED = 3;
const BUFFERING = 4;
const BUFFERED = 5;
const END = 6;
const INVALID = 7;

const NO_ERROR = 0;
const RESOURCE_ERROR = 1;
const FORMAT_ERROR = 2;
const NETWORK_ERROR = 3;

// What is said of an error the browser has no words for.
const ERRORS = ["", "Could not open file", "Could not decode the file", "Could not load the file"];

// What the player tells and nothing sets. Each has a signal that carries
// the new value, as Qt's do: `positionChanged(position)`.
const TOLD = [
  "duration",
  "position",
  "bufferProgress",
  "hasAudio",
  "hasVideo",
  "seekable",
  "playing",
  "playbackState",
  "mediaStatus",
];
// The same, told of by a signal that carries nothing or that several share.
const KEPT = ["error", "errorString", "metaData", "audioTracks", "videoTracks", "subtitleTracks"];
const CHANGED = Object.fromEntries(TOLD.map((name) => [name, `${name}Changed`]));
const ACTIVE = ["activeAudioTrack", "activeVideoTrack", "activeSubtitleTrack"];

const initial = () => ({
  duration: 0,
  position: 0,
  bufferProgress: 0,
  hasAudio: false,
  hasVideo: false,
  seekable: false,
  playing: false,
  playbackState: STOPPED,
  mediaStatus: NO_MEDIA,
  error: NO_ERROR,
  errorString: "",
  metaData: new MetaData(),
  audioTracks: NONE,
  videoTracks: NONE,
  subtitleTracks: NONE,
  // Not Qt's: the size of the picture, for the output that shows it.
  resolution: null,
});

function read(self, name) {
  const media = self.$media;
  media.versions[name][0]();
  return media.values[name];
}

function set(self, name, value) {
  const media = self.$media;
  if (Object.is(media.values[name], value)) return false;
  media.values[name] = value;
  media.versions[name][1](next);
  return true;
}

// What the player will say once everything it has to say is true.
function say(self, ...signal) {
  self.$media.queue.push(signal);
}

function tell(self, name, value) {
  if (set(self, name, value)) say(self, CHANGED[name], value);
}

// Says it, in order. A handler may make the player say more: that is said
// in its turn. It reads what it likes: it is run, not kept up to date.
function announce(self) {
  const { queue } = self.$media;
  if (!queue.length) return;
  settle();
  untrack(() => {
    while (queue.length) {
      const [name, ...args] = queue.shift();
      self[name](...args);
    }
  });
}

const ms = (seconds) => (Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0);
const href = (source) => (source ? String(source) : "");

// The element says where it is four times a second; a slider that follows a
// player wants more. One job asks every player that is playing.
const PERIOD = 100;
const running = new Set();
const ticker = {
  skew: 0,
  wait: PERIOD,
  idle() {
    return this.wait;
  },
  advance(delta) {
    this.wait -= delta;
    if (this.wait > 0) return;
    this.wait = PERIOD;
    for (const self of running) {
      where(self);
      announce(self);
    }
  },
};

function where(self) {
  const media = self.$media;
  // At the end the position is the duration, whatever the element makes of it.
  if (media.loaded && media.values.mediaStatus !== END) tell(self, "position", ms(media.element.currentTime));
}

// Qt says whether it plays before it says what state it is in.
function enter(self, state) {
  tell(self, "playing", state === PLAYING);
  if (!set(self, "playbackState", state)) return;
  say(self, CHANGED.playbackState, state);
  if (state === PLAYING) {
    running.add(self);
    clock.add(ticker);
  } else {
    running.delete(self);
    if (!running.size) clock.remove(ticker);
  }
}

// Whether the file has sound. Not every browser lists the tracks: one that
// does not tells by what it has decoded, and a file without a picture is
// all sound.
function heard(element, picture) {
  const tracks = element.audioTracks;
  if (tracks) return tracks.length > 0;
  if (!picture) return true;
  if (typeof element.mozHasAudio === "boolean") return element.mozHasAudio;
  return element.webkitAudioDecodedByteCount > 0;
}

// The tracks the browser lists, each with what it says of it; where it
// lists none, the `known` ones.
function listed(tracks, known) {
  if (!tracks) return known;
  return Array.from(tracks, (track) => {
    const data = new MetaData();
    if (track.language) data.insert(MediaMetaData.Language, track.language);
    if (track.label) data.insert(MediaMetaData.Title, track.label);
    return data;
  });
}

const subtitles = (element) =>
  Array.from(element.textTracks ?? NONE).filter((track) => track.kind === "subtitles" || track.kind === "captions");

// Which tracks play: the first of each kind until something chooses.
function choose(self, name, index) {
  const active = slot(self, name);
  active.reset();
  active.provide(index);
}

function tracks(self, sounds, picture) {
  const media = self.$media;
  const { element } = media;
  const audio = listed(element.audioTracks, sounds ? [new MetaData()] : NONE);
  const video = listed(element.videoTracks, picture ? [new MetaData([[MediaMetaData.Resolution, picture]])] : NONE);
  set(self, "audioTracks", audio);
  set(self, "videoTracks", video);
  set(self, "subtitleTracks", listed(subtitles(element), NONE));
  choose(self, ACTIVE[0], audio.length ? 0 : -1);
  choose(self, ACTIVE[1], video.length ? 0 : -1);
  choose(self, ACTIVE[2], -1);
  media.active = untrack(() => ACTIVE.map((name) => self[name]));
  select(self);
  say(self, "tracksChanged");
}

// Has the element play the chosen tracks, as far as it lets a page choose.
function select(self) {
  const media = self.$media;
  const { element } = media;
  const [audio, video, text] = media.active;
  const sounds = element.audioTracks;
  if (sounds) for (let index = 0; index < sounds.length; index++) sounds[index].enabled = index === audio;
  const pictures = element.videoTracks;
  if (pictures) for (let index = 0; index < pictures.length; index++) pictures[index].selected = index === video;
  subtitles(element).forEach((track, index) => {
    track.mode = index === text ? "showing" : "disabled";
  });
  // No track is no sound, also where the element has no say in it.
  media.silent = media.values.audioTracks.length > 0 && audio < 0;
  sound(self);
}

// A browser that has refused sound pauses an element that is un-muted while
// it plays. Until sound is allowed the element stays silent.
function hush(self) {
  const media = self.$media;
  media.element.muted = true;
  if (media.hushed) return;
  media.hushed = true;
  media.waiting = whenAudible(() => {
    media.hushed = false;
    sound(self);
  });
}

// Qt plays no sound without an AudioOutput.
function sound(self) {
  const media = self.$media;
  const { element, audio } = media;
  element.volume = Math.min(1, Math.max(0, Number(audio.volume) || 0));
  const quiet = !audio.output || Boolean(audio.muted) || media.silent;
  if (!quiet && element.muted && !element.paused && !audible()) return hush(self);
  element.muted = quiet || media.hushed;
  const sink = audio.device?.id ?? "";
  if (sink === media.sink || !element.setSinkId) return;
  media.sink = sink;
  // A device that is gone, or one the page may not use: the sound stays
  // where it is.
  element.setSinkId(sink).catch(() => {});
}

// What is known of the file once the browser has its first frame.
function describe(self) {
  const { element, values } = self.$media;
  const picture = element.videoWidth > 0 ? new Size(element.videoWidth, element.videoHeight) : null;
  const sounds = heard(element, picture);
  set(self, "resolution", picture);
  tracks(self, sounds, picture);
  const data = new MetaData();
  if (values.duration > 0) data.insert(MediaMetaData.Duration, values.duration);
  if (picture) data.insert(MediaMetaData.Resolution, picture);
  set(self, "metaData", data);
  say(self, "metaDataChanged");
  tell(self, "seekable", element.seekable.length > 0);
  tell(self, "hasAudio", sounds);
  tell(self, "hasVideo", Boolean(picture));
}

// What is known of a file that is gone, or that could not be played.
function forget(self) {
  const { values } = self.$media;
  tell(self, "seekable", false);
  tell(self, "hasAudio", false);
  tell(self, "hasVideo", false);
  set(self, "resolution", null);
  if (!values.metaData.isEmpty()) {
    set(self, "metaData", new MetaData());
    say(self, "metaDataChanged");
  }
  if (values.audioTracks.length || values.videoTracks.length || values.subtitleTracks.length) {
    tracks(self, false, null);
  }
}

function loaded(self) {
  const media = self.$media;
  if (!media.url || media.loaded) return;
  media.loaded = true;
  describe(self);
  tell(self, "mediaStatus", LOADED);
  // What it was told to do while it was loading, it does now.
  const wish = media.wish;
  media.wish = null;
  if (wish === PLAYING) begin(self);
  else if (wish === PAUSED) hold(self);
}

// Asks the element to play. A browser refuses a page the user has done
// nothing with yet, unless the element is a silent one: then it plays
// without sound, which comes on at the user's first press or key.
function attempt(self) {
  const media = self.$media;
  const { element, url } = media;
  const refusal = (error) => {
    // A pause or another source came first, or the file is no good: that
    // is told of by what did it.
    if (error.name !== "NotAllowedError" || media.url !== url) return;
    if (!element.muted && !audible()) {
      hush(self);
      element.play().catch(refusal);
    } else {
      refused(self);
      announce(self);
    }
  };
  element.play()?.catch(refusal);
}

// Not even silently: the player is as it was before it was told to play.
function refused(self) {
  const media = self.$media;
  media.wish = null;
  if (media.values.playbackState !== PLAYING) return;
  enter(self, media.before);
  tell(self, "mediaStatus", media.before === STOPPED ? LOADED : BUFFERED);
}

function begin(self) {
  const media = self.$media;
  const { element, values } = media;
  if (values.playbackState === PLAYING) return;
  const over = values.mediaStatus === END;
  if (over) element.currentTime = 0;
  if (values.playbackState === STOPPED) media.played = 0;
  media.before = values.playbackState;
  enter(self, PLAYING);
  if (over) tell(self, "position", 0);
  if (values.mediaStatus !== BUFFERED) tell(self, "mediaStatus", BUFFERING);
  attempt(self);
}

function hold(self) {
  const media = self.$media;
  const { element, values } = media;
  element.pause();
  if (values.playbackState === PAUSED) return;
  where(self);
  enter(self, PAUSED);
  if (values.mediaStatus === LOADED || values.mediaStatus === END) {
    tell(self, "mediaStatus", BUFFERING);
    tell(self, "mediaStatus", BUFFERED);
  }
}

// Qt's `stop`: back to the start, then stopped, then as when it was loaded.
function halt(self) {
  const media = self.$media;
  const { element, values } = media;
  if (values.playbackState === STOPPED && values.mediaStatus !== END) return;
  element.pause();
  if (element.currentTime !== 0) element.currentTime = 0;
  tell(self, "position", 0);
  enter(self, STOPPED);
  tell(self, "mediaStatus", LOADED);
}

function load(self, url) {
  const media = self.$media;
  const { element, values } = media;
  if (media.loaded) halt(self);
  media.url = url;
  media.loaded = false;
  media.wish = null;
  if (values.error !== NO_ERROR) {
    set(self, "error", NO_ERROR);
    set(self, "errorString", "");
    say(self, "errorChanged");
  }
  tell(self, "duration", 0);
  tell(self, "position", 0);
  tell(self, "bufferProgress", 0);
  if (url) {
    // What was known of the last file stays until this one is.
    tell(self, "mediaStatus", LOADING);
    element.src = url;
    if (untrack(() => self.autoPlay)) {
      media.wish = PLAYING;
      attempt(self);
    }
  } else {
    element.removeAttribute("src");
    element.load();
    forget(self);
    tell(self, "mediaStatus", NO_MEDIA);
  }
}

// A method may be called right after `source` was assigned, before what
// follows the assignment has run.
function sync(self) {
  const url = href(untrack(() => self.source));
  if (url !== self.$media.url) load(self, url);
}

// What the element says, and what the player makes of it.
const EVENTS = {
  durationchange(self, media) {
    if (media.url) tell(self, "duration", ms(media.element.duration));
  },
  loadeddata: loaded,
  resize(self, media) {
    const { element } = media;
    if (media.loaded && element.videoWidth > 0) {
      set(self, "resolution", new Size(element.videoWidth, element.videoHeight));
    }
  },
  // Not by the player's doing: a media key, the browser's own controls.
  play(self, media) {
    if (media.loaded && !media.element.paused) begin(self);
  },
  pause(self, media) {
    const { element } = media;
    if (media.loaded && element.paused && !element.ended && media.values.playbackState === PLAYING) hold(self);
  },
  playing(self, media) {
    if (!media.loaded) return;
    noticed(self);
    if (media.values.playbackState === PLAYING) tell(self, "mediaStatus", BUFFERED);
  },
  waiting(self, media) {
    const { element } = media;
    // Out of data that is still to come: the element says the same of the
    // moment after a seek, when all it waits for is itself.
    if (!media.loaded || element.seeking || element.networkState !== element.NETWORK_LOADING) return;
    if (media.values.playbackState === PLAYING) tell(self, "mediaStatus", STALLED);
  },
  ended(self, media) {
    const { element, values } = media;
    if (values.playbackState !== PLAYING) return;
    tell(self, "position", values.duration);
    // `MediaPlayer.Infinite` is the element's own loop, and never ends.
    if (++media.played < untrack(() => self.loops)) {
      tell(self, "position", 0);
      element.currentTime = 0;
      attempt(self);
      return;
    }
    enter(self, STOPPED);
    tell(self, "mediaStatus", END);
  },
  timeupdate(self) {
    noticed(self);
    where(self);
  },
  seeking: where,
  seeked: where,
  progress(self, media) {
    const { element } = media;
    const ranges = element.buffered;
    const length = element.duration;
    if (!media.loaded || !(length > 0) || !Number.isFinite(length)) return;
    // How far the file is there, from where it plays.
    for (let index = 0; index < ranges.length; index++) {
      if (ranges.start(index) <= element.currentTime && element.currentTime <= ranges.end(index)) {
        tell(self, "bufferProgress", Math.min(1, ranges.end(index) / length));
      }
    }
  },
  error(self, media) {
    const fault = media.element.error;
    // 1 is a load the page itself gave up.
    if (!media.url || !fault || fault.code === 1) return;
    const code = fault.code === 2 ? NETWORK_ERROR : fault.code === 3 ? FORMAT_ERROR : RESOURCE_ERROR;
    const text = fault.message || ERRORS[code];
    media.loaded = false;
    media.wish = null;
    set(self, "error", code);
    set(self, "errorString", text);
    say(self, "errorOccurred", code, text);
    say(self, "errorChanged");
    enter(self, STOPPED);
    forget(self);
    tell(self, "mediaStatus", INVALID);
  },
};

// A browser that does not list the tracks knows of the sound only when it
// has decoded some, which may be after the first frame.
function noticed(self) {
  const media = self.$media;
  const { element, values } = media;
  if (!media.loaded || values.hasAudio || !heard(element, values.resolution)) return;
  set(self, "audioTracks", [new MetaData()]);
  choose(self, ACTIVE[0], 0);
  media.active = untrack(() => ACTIVE.map((name) => self[name]));
  select(self);
  say(self, "tracksChanged");
  tell(self, "hasAudio", true);
}

const methods = {
  play() {
    sync(this);
    const media = this.$media;
    if (!media.url || media.values.mediaStatus === INVALID) return;
    if (media.loaded) begin(this);
    else {
      // Asked now, while the user's press still counts; told of once the
      // file is loaded, as Qt does.
      media.wish = PLAYING;
      attempt(this);
    }
    announce(this);
  },
  pause() {
    sync(this);
    const media = this.$media;
    if (!media.url || media.values.mediaStatus === INVALID) return;
    if (media.loaded) hold(this);
    else {
      media.wish = PAUSED;
      media.element.pause();
    }
    announce(this);
  },
  stop() {
    sync(this);
    const media = this.$media;
    media.wish = null;
    if (media.loaded) halt(this);
    else media.element.pause();
    announce(this);
  },
  setPosition(position) {
    sync(this);
    const media = this.$media;
    const { element, values } = media;
    if (!media.loaded || !values.seekable) return;
    const to = Math.max(0, Math.min(Math.round(Number(position) || 0), values.duration));
    const over = values.mediaStatus === END;
    element.currentTime = to / 1000;
    // No longer at the end: the position is the element's again.
    if (over) set(this, "mediaStatus", LOADED);
    tell(this, "position", to);
    if (over) say(this, CHANGED.mediaStatus, LOADED);
    announce(this);
  },
  setSource(source) {
    this.source = source;
  },
  setPlaybackRate(rate) {
    this.playbackRate = rate;
  },
  get position() {
    return read(this, "position");
  },
  set position(position) {
    this.setPosition(position);
  },
  // The size of the picture, if the file has one that is to be shown.
  $frame() {
    return this.activeVideoTrack < 0 ? null : read(this, "resolution");
  },
};

for (const name of [...TOLD, ...KEPT]) {
  if (name === "position") continue;
  Object.defineProperty(methods, name, {
    get() {
      return read(this, name);
    },
    enumerable: true,
    configurable: true,
  });
}

export const MediaPlayer = defineType("MediaPlayer", QtObject, {
  properties: {
    source: "",
    audioOutput: null,
    videoOutput: null,
    playbackRate: 1,
    loops: 1,
    autoPlay: false,
    activeAudioTrack: -1,
    activeVideoTrack: -1,
    activeSubtitleTrack: -1,
  },
  signals: [
    ...TOLD.map((name) => CHANGED[name]),
    "metaDataChanged",
    "tracksChanged",
    "activeTracksChanged",
    "errorChanged",
    "errorOccurred",
  ],
  enums: {
    StoppedState: STOPPED,
    PlayingState: PLAYING,
    PausedState: PAUSED,
    NoMedia: NO_MEDIA,
    LoadingMedia: LOADING,
    LoadedMedia: LOADED,
    StalledMedia: STALLED,
    BufferingMedia: BUFFERING,
    BufferedMedia: BUFFERED,
    EndOfMedia: END,
    InvalidMedia: INVALID,
    NoError: NO_ERROR,
    ResourceError: RESOURCE_ERROR,
    FormatError: FORMAT_ERROR,
    NetworkError: NETWORK_ERROR,
    AccessDeniedError: 4,
    Infinite: -1,
    Once: 1,
  },
  methods,
  setup(self) {
    // A video element plays sound alone as well, and is the one a browser
    // lets play silently before the user has done anything.
    const element = document.createElement("video");
    element.className = "qq-video";
    element.preload = "auto";
    element.playsInline = true;
    element.muted = true;
    const values = initial();
    const media = (self.$media = {
      element,
      values,
      versions: Object.fromEntries(Object.keys(values).map((name) => [name, signal(0, self.$owner)])),
      queue: [],
      url: "",
      loaded: false,
      // What `play()` or `pause()` asked for while the file was loading.
      wish: null,
      // The state `play()` found it in, and how many times it has played.
      before: STOPPED,
      played: 0,
      audio: { output: null, volume: 1, muted: false, device: null },
      // Silent until the browser allows sound, and what waits for that.
      hushed: false,
      waiting: null,
      // Silent because no audio track is chosen.
      silent: false,
      sink: "",
      active: [-1, -1, -1],
      output: null,
    });
    const listener = (event) => {
      EVENTS[event.type](self, media);
      announce(self);
    };
    for (const type of Object.keys(EVENTS)) element.addEventListener(type, listener);

    effect(
      () => href(self.source),
      (url) => {
        if (url === media.url) return;
        load(self, url);
        announce(self);
      },
    );
    effect(
      () => {
        const output = self.audioOutput;
        return [output, output?.volume, output?.muted, output?.device];
      },
      ([output, volume = 1, muted = false, device = null]) => {
        media.audio = { output, volume, muted, device };
        sound(self);
      },
    );
    effect(
      () => self.videoOutput,
      (output) => {
        if (output === media.output) return;
        media.output?.$release?.(self);
        media.output = output;
        output?.$show?.(self);
      },
    );
    effect(
      () => self.playbackRate,
      (rate) => {
        // A rate the browser cannot play at is not taken.
        try {
          // The default too: a load starts over from it.
          element.defaultPlaybackRate = rate;
          element.playbackRate = rate;
        } catch {}
      },
    );
    effect(
      () => self.loops,
      (loops) => {
        element.loop = loops === -1;
      },
    );
    effect(
      () => ACTIVE.map((name) => self[name]),
      (active) => {
        if (active.every((index, at) => index === media.active[at])) return;
        media.active = active;
        select(self);
        say(self, "activeTracksChanged");
        announce(self);
      },
    );
    onCleanup(() => {
      for (const type of Object.keys(EVENTS)) element.removeEventListener(type, listener);
      running.delete(self);
      if (!running.size) clock.remove(ticker);
      media.waiting?.();
      media.output?.$release?.(self);
      element.pause();
      element.removeAttribute("src");
      element.load();
    });
  },
});
