import QtQuick
import App.Media as M

Item {
    width: 100; height: 100
    property alias said: player.says
    M.Player { id: player }
}
