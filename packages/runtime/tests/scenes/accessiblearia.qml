// What a reader is told where Qt's roles and ARIA's words differ: a
// button that checks is a toggle, a heading has a level, and a name
// with no role names a group, as native Ljós has it; a part of a page
// is a landmark a reader can go to; a control of a value says its value,
// which ARIA asks of a slider; the chosen item of a list is its current
// one. Every attribute
// is one ARIA allows on the role it is said with.
import QtQuick
import QtQuick.Templates as T

Item {
    id: root
    width: 400
    height: 300
    property bool on: false

    Column {
        Rectangle {
            id: menu
            width: 40; height: 40
            Accessible.role: Accessible.Button
            Accessible.name: "Menu"
            Accessible.checkable: true
            Accessible.checked: root.on
        }
        T.Button { id: bold; width: 80; height: 20; text: "Bold"; checkable: true; checked: root.on }
        T.Button { id: plain; width: 80; height: 20; text: "Plain" }
        Rectangle {
            id: entry
            width: 80; height: 20
            Accessible.role: Accessible.MenuItem
            Accessible.name: "Wrap"
            Accessible.checkable: true
            Accessible.checked: root.on
        }
        Text { id: title; text: "Title"; Accessible.role: Accessible.Heading }
        Rectangle { id: named; width: 40; height: 40; Accessible.name: "A lit scene" }
        Image { id: picture; width: 40; height: 40; Accessible.role: Accessible.Graphic; Accessible.name: "A lit scene" }
        Rectangle { id: blank; width: 40; height: 40; Accessible.role: Accessible.Whitespace }
        Rectangle { id: caret; width: 40; height: 40; Accessible.role: Accessible.Caret; Accessible.name: "Here" }
        Rectangle { id: section; width: 40; height: 40; Accessible.role: Accessible.Section; Accessible.name: "The page" }
        Rectangle { id: aside; width: 40; height: 40; Accessible.role: Accessible.ComplementaryContent; Accessible.name: "On this page" }
        Rectangle { id: footer; width: 40; height: 40; Accessible.role: Accessible.Footer }
        T.ProgressBar { id: progress; width: 80; height: 10; value: root.on ? 0.75 : 0.25 }
        T.SpinBox { id: spin; width: 80; height: 20; from: 1; to: 9; value: 3 }
        Rectangle {
            width: 80; height: 20
            Accessible.role: Accessible.List
            Accessible.name: "Results"
            Rectangle { id: result; width: 80; height: 20; Accessible.role: Accessible.ListItem; Accessible.name: "Result"; Accessible.selected: root.on }
        }
        Rectangle { id: puck; width: 40; height: 40; Accessible.role: Accessible.Slider; Accessible.name: "Lead the puck" }
    }

    function items() {
        return { menu, bold, plain, entry, title, named, picture, blank, caret, section, aside, footer, progress, spin, puck, result }
    }

    function step() {
        root.on = true
    }
}
