import QtQuick
import App.Media
import App.Sensors

// `Meter` is of the one dump and built on `Player` of the other.
Column {
    id: root

    Player {
        id: player
        volume: 4
    }
    Meter {
        id: meter
        level: 9
        volume: 2
    }
    Text {
        id: shown
        text: "Volume " + player.volume + ", level " + meter.level + ", its volume " + meter.volume
    }

    function read() {
        return shown.text
    }
}
