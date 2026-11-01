// Ljós's json-list-model.feature, "A file watched with the QML is read again
// when saved": on a dev server, a save of the file no module imports.
import QtQuick
import Ljos.Models

Item {
    id: root
    property int made: 0
    property int taps: 0
    property alias m: m
    property string statuses: ""
    JsonListModel { id: m; onStatusChanged: root.statuses += status + ";" }
    Repeater {
        model: m
        delegate: Item {
            required property string name
            Component.onCompleted: root.made += 1
        }
    }
    property string first: m.count ? m.get(0).name : ""
}
