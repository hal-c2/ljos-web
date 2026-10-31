// Ljós's json-list-model.feature, "JSON that cannot be used leaves the rows
// as they were".
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
    JsonListModel { id: m; json: '[{"a": 1}, {"a": 2}]' }
    Recorder { id: rec; model: m }
    function next(text) { rec.seen = ""; m.json = text }
    property var kept: m.count ? m.get(1).a : 0
}
