import QtQuick
import Pantry

// The Pantry app's own shell: the arrangement, words and colours
// around its blocks. This is the file the editor beside the demo
// starts from — rewrite it and apply: the basket, the note and
// the status contribution are the app's blocks, so they stay
// exactly as they were while everything around them changes.
Rectangle {
    objectName: "appShell"
    width: 480
    height: 400
    color: "#171a23"

    Column {
        x: 18
        y: 14
        spacing: 12

        Text {
            objectName: "pantryTitle"
            color: "#f0ead8"
            font.pixelSize: 24
            text: "The Corner Pantry"
        }
        // The status line lives here, in the header. Move the
        // StatusSlot somewhere else and it moves.
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
                color: "#232839"
                Text {
                    x: 10
                    y: 8
                    color: "#e8eaf0"
                    font.pixelSize: 15
                    text: "Tea · £" + basket.teaPrice.toFixed(2)
                }
                Text {
                    objectName: "teaCount"
                    x: 10
                    y: 32
                    color: "#9aa3b2"
                    font.pixelSize: 13
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
                color: "#232839"
                Text {
                    x: 10
                    y: 8
                    color: "#e8eaf0"
                    font.pixelSize: 15
                    text: "Bread · £" + basket.breadPrice.toFixed(2)
                }
                Text {
                    objectName: "breadCount"
                    x: 10
                    y: 32
                    color: "#9aa3b2"
                    font.pixelSize: 13
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
                color: "#232839"
                Text {
                    x: 10
                    y: 8
                    color: "#e8eaf0"
                    font.pixelSize: 15
                    text: "Jam · £" + basket.jamPrice.toFixed(2)
                }
                Text {
                    objectName: "jamCount"
                    x: 10
                    y: 32
                    color: "#9aa3b2"
                    font.pixelSize: 13
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
            color: "#7c869e"
            font.pixelSize: 13
            text: "Tap a good to add it. Then rewrite this shell — nothing you bought moves."
        }
    }
}
