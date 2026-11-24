import QtQuick
import Pantry

// The shop's layout, yours to edit. Its basket, note and status
// keep what they hold while you change everything around them.
Rectangle {
    id: shell
    objectName: "appShell"
    width: 480
    height: 400
    color: Application.styleHints.colorScheme === Qt.ColorScheme.Dark ? "#171a23" : "#f6f4ee"

    // Colours for a dark background or a light one, whatever you set.
    QtObject {
        id: look
        readonly property bool dark: shell.color.hslLightness < 0.5
        readonly property color ink1: dark ? "#f0ead8" : "#1b1f2a"
        readonly property color ink2: dark ? "#e8eaf0" : "#1b1f2a"
        readonly property color muted1: dark ? "#9aa3b2" : "#4d5566"
        readonly property color muted2: dark ? "#7c869e" : "#4d5566"
        readonly property color raised: dark ? "#232839" : "#ffffff"
    }

    Column {
        x: 18
        y: 14
        spacing: 12

        Text {
            objectName: "pantryTitle"
            color: look.ink1
            font.pixelSize: 26
            text: "The Corner Pantry"
        }
        // The basket's summary. Try moving it below Basket.
        StatusSlot {
            objectName: "statusSlot"
        }

        Row {
            height: 58
            spacing: 10
            Rectangle {
                objectName: "teaButton"
                width: 140
                height: 58
                radius: 8
                color: look.raised
                Text {
                    x: 10
                    y: 8
                    color: look.ink2
                    font.pixelSize: 18
                    text: "Tea · £" + basket.teaPrice.toFixed(2)
                }
                Text {
                    objectName: "teaCount"
                    x: 10
                    y: 32
                    color: look.muted1
                    font.pixelSize: 16
                    text: basket.teaCount + " in basket"
                }
                MouseArea {
                    Accessible.name: "Add tea"
                    Accessible.role: Accessible.Button
                    width: parent.width
                    height: parent.height
                    onClicked: basket.addTea()
                }
            }
            Rectangle {
                objectName: "breadButton"
                width: 140
                height: 58
                radius: 8
                color: look.raised
                Text {
                    x: 10
                    y: 8
                    color: look.ink2
                    font.pixelSize: 18
                    text: "Bread · £" + basket.breadPrice.toFixed(2)
                }
                Text {
                    objectName: "breadCount"
                    x: 10
                    y: 32
                    color: look.muted1
                    font.pixelSize: 16
                    text: basket.breadCount + " in basket"
                }
                MouseArea {
                    Accessible.name: "Add bread"
                    Accessible.role: Accessible.Button
                    width: parent.width
                    height: parent.height
                    onClicked: basket.addBread()
                }
            }
            Rectangle {
                objectName: "jamButton"
                width: 140
                height: 58
                radius: 8
                color: look.raised
                Text {
                    x: 10
                    y: 8
                    color: look.ink2
                    font.pixelSize: 18
                    text: "Jam · £" + basket.jamPrice.toFixed(2)
                }
                Text {
                    objectName: "jamCount"
                    x: 10
                    y: 32
                    color: look.muted1
                    font.pixelSize: 16
                    text: basket.jamCount + " in basket"
                }
                MouseArea {
                    Accessible.name: "Add jam"
                    Accessible.role: Accessible.Button
                    width: parent.width
                    height: parent.height
                    onClicked: basket.addJam()
                }
            }
        }

        Basket {
            id: basket
            objectName: "basket"
            width: 444
        }
        Note {
            objectName: "note"
            width: 444
        }
        Text {
            color: look.muted2
            font.pixelSize: 16
            text: "Add an item, then edit the code. Your basket stays."
        }
    }
}
