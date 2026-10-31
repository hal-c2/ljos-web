// Ljós's json-list-model.feature: the rows a JsonListModel makes of the
// text it is given, and what each reads as.
import QtQuick
import Ljos.Models

Item {
    id: root
    property alias m: m
    property alias empty: empty
    property alias got: got
    property alias twice: twice
    property string names: m.roles.join(",")
    property var enums: [JsonListModel.Null, JsonListModel.Ready, JsonListModel.Loading, JsonListModel.Error]
    property string nulls: ""
    property string typed: ""

    JsonListModel {
        id: m
        json: '[{"name": "a", "n": 1}, {"tag": "x", "name": "b"}]'
    }
    JsonListModel { id: empty }
    JsonListModel {
        id: got
        json: '[{"name": "a", "tags": ["x", "y"], "at": {"line": 3}}, {"name": "b", "gone": null}]'
    }
    property string first: got.count ? JSON.stringify(got.get(0)) : ""
    property string second: got.count ? JSON.stringify(got.get(1)) : ""
    property string beyond: got.count ? typeof got.get(2) : ""
    property string before: got.count ? typeof got.get(-1) : ""
    property string between: got.count ? typeof got.get(0.5) : ""

    JsonListModel { id: twice; json: '[{"a": 1, "a": 2}]' }
    property var a: twice.count ? twice.get(0).a : 0

    JsonListModel { id: holes; json: '[{"a": 1, "b": null}, {"a": 2}]' }
    Repeater {
        model: holes
        delegate: Item {
            required property var b
            Component.onCompleted: root.nulls += (b === undefined ? "undefined" : b === null ? "null" : "other") + ";"
        }
    }

    JsonListModel {
        id: kinds
        json: '[{"i": 3, "r": 0.5, "t": true, "s": "é\\n", "l": [1, 2], "o": {"k": "v"}}]'
    }
    Repeater {
        model: kinds
        delegate: Item {
            required property var i; required property var r; required property var t
            required property var s; required property var l; required property var o
            Component.onCompleted: root.typed = [i + 1, r * 2, t === true, s.length, l[1], o.k].join(",")
        }
    }
}
