// Ljós's json-list-model.feature, "A change says only what differs": what a
// program following the model hears of each new text.
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

    property alias m: m
    property alias rec: rec
    JsonListModel { id: m; json: '[{"n": 1, "s": "a"}, {"n": 2, "s": "b"}, {"n": 3, "s": "c"}]' }
    Recorder { id: rec; model: m }
    function next(text) { rec.seen = ""; m.json = text; return rec.seen }

    // A new key, a key gone, the first rows.
    property alias grown: grown
    property string grownNames: grown.roles.join(",")
    JsonListModel { id: grown; json: '[{"a": 1}, {"a": 2}]' }
    Recorder { id: grownRec; model: grown }
    function grow() { grownRec.seen = ""; grown.json = '[{"a": 1}, {"a": 2, "b": 3}]'; return grownRec.seen }

    property alias shrunk: shrunk
    property string shrunkNames: shrunk.roles.join(",")
    JsonListModel { id: shrunk; json: '[{"a": 1, "b": 2}]' }
    Recorder { id: shrunkRec; model: shrunk }
    function shrink() { shrunkRec.seen = ""; shrunk.json = '[{"b": 2}, {"c": 3}]'; return shrunkRec.seen }

    JsonListModel { id: firsts; json: '[{"a": 1}]' }
    Recorder { id: firstRec; model: firsts }
    property alias firstSeen: firstRec.seen

    // The delegates of the rows that stayed are kept.
    property int made: 0
    property string shown: ""
    JsonListModel { id: kept; json: '[{"s": "a"}, {"s": "b"}, {"s": "c"}]' }
    Repeater {
        id: rep
        model: kept
        delegate: Text {
            required property string s
            text: s
            Component.onCompleted: root.made += 1
        }
    }
    function keep() { kept.json = '[{"s": "a"}, {"s": "z"}, {"s": "c"}, {"s": "d"}]'; shown = rep.itemAt(1).text }
}
