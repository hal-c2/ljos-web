// Item {
//     SoundEffect {
//         id: beep; source: "/assets/beep.wav"
//         onStatusChanged: log.push("beep status " + status)
//         onLoadedChanged: log.push("beep loaded")
//         onPlayingChanged: log.push("beep playing " + playing)
//         onLoopsRemainingChanged: log.push("beep remaining " + loopsRemaining)
//         onLoopCountChanged: log.push("beep loops " + loops)
//     }
//     SoundEffect { id: other; source: "/assets/beep.wav"; volume: 0.5 }
//     SoundEffect { id: once; loops: 0; source: "/assets/beep.wav" }
//     SoundEffect { id: broken; source: "/assets/flag.png"; onStatusChanged: log.push("broken status " + status) }
//     SoundEffect { id: none }
// }
import { $object } from "ljos-web/object";
import { clock, Item } from "ljos-web/QtQuick";
import { SoundEffect } from "ljos-web/QtMultimedia";
import { make } from "../scene.js";

const names = ["beep", "other", "once", "broken", "none"];
export const objects = { log: [], clock, SoundEffect };

export default function Sounds() {
  // The sound is a tenth of a second: the test says when that has passed.
  clock.stop();
  for (const name of names) objects[name] = $object();
  const { log, beep, other, once, broken, none } = objects;
  const source = "/assets/beep.wav";
  return make(Item, {}, () => [
    make(SoundEffect, {
      $self: beep,
      source,
      onStatusChanged: () => log.push(`beep status ${beep.status}`),
      onLoadedChanged: () => log.push("beep loaded"),
      onPlayingChanged: () => log.push(`beep playing ${beep.playing}`),
      onLoopsRemainingChanged: () => log.push(`beep remaining ${beep.loopsRemaining}`),
      onLoopCountChanged: () => log.push(`beep loops ${beep.loops}`),
    }),
    make(SoundEffect, { $self: other, source, volume: 0.5 }),
    make(SoundEffect, { $self: once, loops: 0, source }),
    make(SoundEffect, {
      $self: broken,
      source: "/assets/flag.png",
      onStatusChanged: () => log.push(`broken status ${broken.status}`),
    }),
    make(SoundEffect, { $self: none }),
  ]);
}
