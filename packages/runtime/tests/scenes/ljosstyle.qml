// The controls of `import QtQuick.Controls` where no Qt is installed: the
// runtime's tests have a stand-in Qt without Qt Quick Controls, so these are
// Ljós's own style (`controls/`). `answers` is what Ljós's native engine
// says of the same QML (ljos-ui's features/controls at the commit the style
// is copied from).
import QtQuick
import QtQuick.Controls

Item {
    id: root
    width: 400
    height: 300

    Button { id: button }
    Button { id: go; y: 50; text: "Go" }
    CheckBox { id: check; y: 100 }
    Switch { id: toggle; y: 150; text: "Lights" }
    Slider { id: slider; y: 200 }
    TextField { id: field; x: 200 }
    ComboBox { id: combo; x: 200; y: 50; model: ["One", "Two"] }
    Button {
        id: mine
        x: 200; y: 100
        background: Rectangle { objectName: "mine"; implicitWidth: 70; implicitHeight: 30 }
    }

    function answers() {
        return [
            [button.implicitWidth, button.implicitHeight, button.padding, button.horizontalPadding],
            [check.implicitWidth, check.implicitHeight, check.implicitIndicatorWidth, check.implicitIndicatorHeight,
             check.indicator.x, check.indicator.y],
            [slider.implicitWidth, slider.implicitHeight],
            [field.implicitWidth, field.implicitHeight],
            [combo.implicitWidth, combo.implicitHeight, combo.currentText],
            [toggle.implicitHeight],
        ]
    }

    // A part a style gives as a Component is an item of the control's own;
    // one the application gives is all there is of that part.
    function parts() {
        return [button.background.parent === button, check.indicator.parent === check,
                slider.handle.parent === slider, combo.indicator.parent === combo,
                mine.implicitWidth, mine.implicitHeight, mine.background.objectName,
                mine.children.length, button.children.length]
    }

    function items() {
        return { go: go, check: check, toggle: toggle, slider: slider, field: field, combo: combo }
    }
}
