// Ljós's json-list-model.feature, "A source is read in the background".
import QtQuick
import Ljos.Models

Item {
    id: root
    component Recorder: Item {
        id: rec
        property var model
        property string seen: ""
        function say(s) { seen = (seen ? seen + " " : "") + s }
        Connections {
            target: rec.model
            function onCountChanged() { rec.say("count" + rec.model.count) }
            function onDataChanged(tl, br, roles) { rec.say("data" + tl.row + "-" + br.row + JSON.stringify(roles)) }
            function onRowsInserted(p, f, l) { rec.say("+" + f + "-" + l) }
            function onRowsRemoved(p, f, l) { rec.say("x" + f + "-" + l) }
            function onModelReset() { rec.say("reset") }
            function onRolesChanged() { rec.say("roles") }
        }
    }

    // Loading, then Ready.
    property string seen: ""
    property alias m: m
    property int statusAtFirst: -1
    JsonListModel {
        id: m; source: "json/rows.json"
        onCountChanged: root.seen += "count " + count + ";"
        onStatusChanged: root.seen += "status " + status + ";"
    }
    Repeater {
        model: m
        delegate: Item {
            required property string name
            Component.onCompleted: root.seen += name + ";"
        }
    }
    Component.onCompleted: statusAtFirst = m.status

    // A source wins over the text.
    property alias both: both
    JsonListModel { id: both; source: "json/file.json"; json: '[{"name": "text"}]' }
    property string bothFirst: both.count ? both.get(0).name : ""

    // Not there; broken.
    property alias missing: missing
    JsonListModel { id: missing; source: "json/missing.json" }
    property bool missingSays: missing.error.indexOf("missing.json") >= 0
    property alias broken: broken
    JsonListModel { id: broken; source: "json/broken.json" }
    property bool brokenSays: /broken\.json:\d+:\d+: /.test(broken.error)

    // reload.
    property string reloads: ""
    property alias again: again
    JsonListModel { id: again; source: "json/single.json"; onStatusChanged: root.reloads += status + ";" }
    Recorder { id: againRec; model: again }
    property alias againSeen: againRec.seen

    // A new source: what differs.
    property alias swapped: swapped
    JsonListModel { id: swapped; source: "json/one.json" }
    Recorder { id: swappedRec; model: swapped }
    property alias swappedSeen: swappedRec.seen
    function swap() { swapped.source = Qt.resolvedUrl("json/two.json") }
}
