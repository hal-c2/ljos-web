import QtQuick
import Ljos.Models

Column {
    JsonListModel { id: people; source: "data/people.json" }
    Repeater {
        model: people
        delegate: Text { required property string name; text: name }
    }
    Text {
        text: "Read again"
        MouseArea { anchors.fill: parent; onClicked: people.reload() }
    }
}
