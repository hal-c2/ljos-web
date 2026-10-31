// Ljós's json-list-model.feature: a relative source in a component file.
import QtQuick
import "team"

Item {
    Members { id: t }
    MembersRoot { id: r }
    MembersResolved { id: q }
    property string inside: t.model.count ? t.model.get(0).name : ""
    property string onRoot: r.model.count ? r.model.get(0).name : ""
    property string resolved: q.model.count ? q.model.get(0).name : ""
}
