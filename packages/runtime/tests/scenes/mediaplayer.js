// Item {
//     id: root; width: 200; height: 100
//     MediaDevices { id: devices; onAudioOutputsChanged: log.push("outputs " + audioOutputs.length) }
//     MediaPlayer {
//         id: player
//         videoOutput: output
//         audioOutput: AudioOutput { id: audio }
//         onSourceChanged: log.push("source")
//         onDurationChanged: duration => log.push("duration " + duration)
//         onPositionChanged: position => log.push("position " + position)
//         onPlayingChanged: playing => log.push("playing " + playing)
//         onPlaybackStateChanged: newState => log.push("state " + newState)
//         onMediaStatusChanged: status => log.push("status " + status)
//         onSeekableChanged: seekable => log.push("seekable " + seekable)
//         onHasAudioChanged: available => log.push("hasAudio " + available)
//         onHasVideoChanged: videoAvailable => log.push("hasVideo " + videoAvailable)
//         onMetaDataChanged: log.push("metaData " + metaData.keys())
//         onTracksChanged: log.push("tracks " + [activeAudioTrack, activeVideoTrack, activeSubtitleTrack])
//         onActiveTracksChanged: log.push("active " + [activeAudioTrack, activeVideoTrack, activeSubtitleTrack])
//         onErrorOccurred: (error, errorString) => log.push("error " + error + " " + (errorString !== ""))
//         onErrorChanged: log.push("errorChanged " + error)
//     }
//     VideoOutput { id: output; anchors.fill: parent }
//     Video { id: video; y: 100; width: 100; height: 50; onPlaying: log.push("video playing") ... }
// }
import { $object } from "ljos-web/object";
import { Item } from "ljos-web/QtQuick";
import { AudioOutput, MediaDevices, MediaMetaData, MediaPlayer, Video, VideoOutput } from "ljos-web/QtMultimedia";
import { make } from "../scene.js";

const names = ["root", "devices", "player", "audio", "output", "video"];
export const objects = { log: [], MediaPlayer, MediaMetaData, VideoOutput };

export default function Player() {
  for (const name of names) objects[name] = $object();
  const { log, root, devices, player, audio, output, video } = objects;
  const active = () => [player.activeAudioTrack, player.activeVideoTrack, player.activeSubtitleTrack];
  return make(Item, { $self: root, width: 200, height: 100 }, () => [
    make(MediaDevices, {
      $self: devices,
      onAudioOutputsChanged: () => log.push(`outputs ${devices.audioOutputs.length}`),
    }),
    make(MediaPlayer, {
      $self: player,
      videoOutput: output,
      get audioOutput() {
        return make(AudioOutput, { $self: audio });
      },
      onSourceChanged: () => log.push("source"),
      onDurationChanged: (duration) => log.push(`duration ${duration}`),
      onPositionChanged: (position) => log.push(`position ${position}`),
      onPlayingChanged: (playing) => log.push(`playing ${playing}`),
      onPlaybackStateChanged: (newState) => log.push(`state ${newState}`),
      onMediaStatusChanged: (status) => log.push(`status ${status}`),
      onSeekableChanged: (seekable) => log.push(`seekable ${seekable}`),
      onHasAudioChanged: (available) => log.push(`hasAudio ${available}`),
      onHasVideoChanged: (videoAvailable) => log.push(`hasVideo ${videoAvailable}`),
      onMetaDataChanged: () => log.push(`metaData ${player.metaData.keys()}`),
      onTracksChanged: () => log.push(`tracks ${active()}`),
      onActiveTracksChanged: () => log.push(`active ${active()}`),
      onErrorOccurred: (error, errorString) => log.push(`error ${error} ${errorString !== ""}`),
      onErrorChanged: () => log.push(`errorChanged ${player.error}`),
    }),
    make(VideoOutput, {
      $self: output,
      get anchors$fill() {
        return root;
      },
    }),
    make(Video, {
      $self: video,
      y: 100,
      width: 100,
      height: 50,
      onPlaying: () => log.push("video playing"),
      onPaused: () => log.push("video paused"),
      onStopped: () => log.push("video stopped"),
      onErrorOccurred: (error) => log.push(`video error ${error}`),
      onDurationChanged: () => log.push(`video duration ${video.duration}`),
    }),
  ]);
}
