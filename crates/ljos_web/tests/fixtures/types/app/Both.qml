import QtQuick
import App.Media
import App.Sensors

Column {
    Player {
        id: player
        volume: 4
    }
    Meter {
        id: meter
        level: 9
        volume: 2
    }
    Text { text: "Volume " + player.volume + ", level " + meter.level }
}
