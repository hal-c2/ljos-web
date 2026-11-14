// Video: a VideoOutput with a MediaPlayer and an AudioOutput of its own.
import { defineType, derived } from "../object.ts";
import { AudioOutput } from "./devices.js";
import { MediaPlayer } from "./MediaPlayer.js";
import { VideoOutput } from "./VideoOutput.js";

// What reads as the player's.
const told = (name) => derived((self) => self.$player[name]);

export const Video = defineType("Video", VideoOutput, {
  properties: {
    source: "",
    autoPlay: false,
    loops: 1,
    playbackRate: 1,
    volume: 1,
    muted: false,
    playbackState: told("playbackState"),
    bufferProgress: told("bufferProgress"),
    duration: told("duration"),
    error: told("error"),
    errorString: told("errorString"),
    hasAudio: told("hasAudio"),
    hasVideo: told("hasVideo"),
    metaData: told("metaData"),
    seekable: told("seekable"),
    position: told("position"),
  },
  signals: ["paused", "stopped", "playing", "errorOccurred"],
  methods: {
    play() {
      this.$player.play();
    },
    pause() {
      this.$player.pause();
    },
    stop() {
      this.$player.stop();
    },
    seek(offset) {
      this.$player.setPosition(offset);
    },
    // Assigning to the position is a seek, as it is for the player.
    get position() {
      return this.$player.position;
    },
    set position(offset) {
      this.$player.setPosition(offset);
    },
  },
  setup(self) {
    const output = AudioOutput({
      get volume() {
        return self.volume;
      },
      get muted() {
        return self.muted;
      },
    });
    self.$player = MediaPlayer({
      get source() {
        return self.source;
      },
      get autoPlay() {
        return self.autoPlay;
      },
      get loops() {
        return self.loops;
      },
      get playbackRate() {
        return self.playbackRate;
      },
      audioOutput: output,
      videoOutput: self,
      onPlaybackStateChanged(state) {
        if (state === MediaPlayer.PausedState) self.paused();
        else if (state === MediaPlayer.StoppedState) self.stopped();
        else self.playing();
      },
      onErrorOccurred: (error, errorString) => self.errorOccurred(error, errorString),
    });
  },
});
