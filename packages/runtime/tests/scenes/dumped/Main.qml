import QtQuick
import App.Media

// `Player` is described by `native/ljostypes.json` alone: its stand-in
// holds what it is given, emits its signals and does nothing as it is
// asked to seek.
Column {
    id: root
    property var ended: []

    Player {
        id: player
        volume: 3
        onFinished: (position) => root.ended = root.ended.concat([position])
    }
    Text {
        id: shown
        text: "Volume " + player.volume
    }

    function read() {
        return [shown.text, player.volume, player.title, Player.Playing, player.seek(2), root.ended]
    }
    function give(volume) {
        player.volume = volume
    }
    function finish(position) {
        player.finished(position)
    }
}
