import QtQuick
import QtQuick.Controls

// Each control at the size its style gives it, which the page also says in
// words, and a button that counts its clicks.
Column {
    property int clicks: 0

    Button { id: go; text: "Go"; onClicked: clicks++ }
    CheckBox { id: check }
    Slider { id: slider }
    TextField { id: field }
    ComboBox { id: combo; model: ["One", "Two"] }
    Text {
        text: [go.width, go.height, check.width, check.height, slider.width, slider.height,
               field.width, field.height, combo.width, combo.height].join(" ")
    }
    Text { text: "clicked " + clicks }
}
