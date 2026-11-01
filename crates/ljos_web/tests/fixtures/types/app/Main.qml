import QtQuick
import App.Media

Column {
    Player {
        id: player
        volume: 3
        onFinished: (position) => console.log(position)
        onVolumeChanged: console.log(volume)
        Component.onCompleted: player.seek(2)
    }
    Text { text: "Volume " + player.volume + " " + player.title + " " + Player.Playing }
}
