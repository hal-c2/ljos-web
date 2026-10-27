// What plays as soon as the page is there, before the user has done anything
// with it. The scene says so in the console: a test that asked the page
// would itself count as the user.
//
// Item {
//     id: root; width: 200; height: 100
//     MediaPlayer {
//         id: player
//         source: "/assets/sound.webm"; loops: MediaPlayer.Infinite
//         audioOutput: AudioOutput {}
//         videoOutput: output
//         onPlaybackStateChanged: log.push("state " + playbackState)
//         onErrorOccurred: error => log.push("error " + error)
//         Component.onCompleted: play()
//     }
//     VideoOutput { id: output; anchors.fill: parent }
//     SoundEffect {
//         id: effect
//         source: "/assets/beep.wav"; loops: SoundEffect.Infinite
//         onPlayingChanged: console.log("effect playing " + playing)
//         Component.onCompleted: play()
//     }
// }
import { $object } from "ljos-web/object";
import { Item } from "ljos-web/QtQuick";
import { AudioOutput, MediaPlayer, SoundEffect, VideoOutput } from "ljos-web/QtMultimedia";
import { make } from "../scene.js";

const names = ["root", "player", "output", "effect"];
export const objects = { log: [] };

export default function Autoplay() {
  for (const name of names) objects[name] = $object();
  const { log, root, player, output, effect } = objects;
  const made = make(Item, { $self: root, width: 200, height: 100 }, () => [
    make(MediaPlayer, {
      $self: player,
      source: "/assets/sound.webm",
      loops: MediaPlayer.Infinite,
      videoOutput: output,
      get audioOutput() {
        return make(AudioOutput, {});
      },
      onPlaybackStateChanged: () => log.push(`state ${player.playbackState}`),
      onErrorOccurred: (error) => log.push(`error ${error}`),
      Component$onCompleted: () => player.play(),
    }),
    make(VideoOutput, {
      $self: output,
      get anchors$fill() {
        return root;
      },
    }),
    make(SoundEffect, {
      $self: effect,
      source: "/assets/beep.wav",
      loops: SoundEffect.Infinite,
      onPlayingChanged: () => console.log(`effect playing ${effect.playing}`),
      Component$onCompleted: () => effect.play(),
    }),
  ]);
  // The picture moves: the browser plays it, with sound or without. What
  // the page was allowed is written down then, before a test can ask.
  const { element } = player.$media;
  element.addEventListener("playing", () => {
    log.push(`moving muted ${element.muted}`);
    console.log("player playing");
  });
  return made;
}
