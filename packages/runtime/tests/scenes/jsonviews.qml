// Ljós's json-list-model.feature: each view shows a JsonListModel's rows.
import QtQuick
import Ljos.Models

Item {
    id: root
    width: 200; height: 400
    property string repeated: ""
    property string listed: ""
    property string gridded: ""
    property string single: ""
    property string tabled: ""
    property alias table: table

    JsonListModel { id: m; json: '[{"name": "a"}, {"name": "b"}]' }
    Repeater {
        model: m
        delegate: Item {
            width: 20; height: 20
            required property string name
            required property int index
            Component.onCompleted: root.repeated += index + name + ";"
        }
    }
    ListView {
        width: 100; height: 100
        model: m
        delegate: Item {
            width: 20; height: 20
            required property string name
            required property int index
            Component.onCompleted: root.listed += index + name + ";"
        }
    }
    GridView {
        y: 100; width: 100; height: 100
        model: m
        delegate: Item {
            width: 20; height: 20
            required property string name
            required property int index
            Component.onCompleted: root.gridded += index + name + ";"
        }
    }

    JsonListModel { id: one; json: '[{"name": "a"}]' }
    Repeater {
        model: one
        delegate: Item {
            required property var modelData
            Component.onCompleted: root.single = modelData
        }
    }

    TableView {
        id: table
        y: 200; width: 100; height: 100
        model: m
        delegate: Item {
            implicitWidth: 20; implicitHeight: 20
            required property string name
            required property int row
            Component.onCompleted: root.tabled += row + name + ";"
        }
    }
}
