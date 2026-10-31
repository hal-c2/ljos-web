// What a control says to a reader when its author says nothing of it: a
// role by its type and a name from its text or title, as native Ljós says
// them. An author's `Accessible` is theirs.
import QtQuick
import QtQuick.Templates as T

Item {
    id: root
    width: 400
    height: 300
    property bool on: false

    // A template draws nothing, so the ones a reader is to find are given
    // a size: a browser leaves out of what it reads what takes no room.
    Column {
        T.Button { id: go; width: 80; height: 20; text: root.on ? "&Stop" : "&Go" }
        T.CheckBox { id: check; width: 80; height: 20; text: "Check"; checked: root.on }
        T.Switch { id: toggle; text: "Lights" }
        T.Slider { id: slider }
        T.GroupBox { id: group; title: "Options" }
        T.Label { id: label; text: "Plain" }
        T.TabBar { id: tabs; T.TabButton { id: tab; text: "&First" } T.TabButton { id: second; text: "Second" } }
        T.Button { id: mine; text: "Delete"; Accessible.name: "Remove the row" }
        T.CheckBox { id: told; text: "Told"; Accessible.checked: true }
        T.Button { id: other; text: "Odd"; Accessible.role: Accessible.Link }
    }

    function read() {
        return [go.Accessible.role === Accessible.Button, go.Accessible.name, check.Accessible.role === Accessible.CheckBox,
                label.Accessible.role === Accessible.StaticText, group.Accessible.name, mine.Accessible.name,
                other.Accessible.role === Accessible.Link]
    }

    function items() {
        return { go, check, toggle, slider, group, label, tabs, tab, second, mine, told, other }
    }

    function step() {
        root.on = true
    }
}
