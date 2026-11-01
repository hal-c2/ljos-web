import QtQuick
import Ljos.Models

JsonListModel {
    property var model: this
    source: Qt.resolvedUrl("members.json")
}
