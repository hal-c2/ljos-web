import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Pantry

// The shop's layout, yours to edit. Its basket, note and status
// keep what they hold while you change everything around them.
Rectangle {
    id: shell
    objectName: "appShell"
    width: 480
    height: 400
    fill: App.hints.colorScheme === ColorScheme.Dark ? "#171a23" : "#f6f4ee"

    // Colours for a dark background or a light one, whatever you set.
    Object {
        id: look
        readonly property bool dark: shell.fill.hslLightness < 0.5
        readonly property color ink1: dark ? "#f0ead8" : "#1b1f2a"
        readonly property color ink2: dark ? "#e8eaf0" : "#1b1f2a"
        readonly property color muted1: dark ? "#9aa3b2" : "#4d5566"
        readonly property color muted2: dark ? "#7c869e" : "#4d5566"
        readonly property color raised: dark ? "#232839" : "#ffffff"
    }

    // Anchored from the left: a right-to-left page mirrors it.
    Column {
        anchors.left: parent.left
        anchors.leftMargin: 18
        y: 14
        spacing: 12

        Text {
            objectName: "pantryTitle"
            color: look.ink1
            font.size: 26
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
                fill: look.raised
                Text {
                    anchors.left: parent.left
                    anchors.leftMargin: 10
                    y: 8
                    color: look.ink2
                    font.size: 18
                    text: t`Tea · £${basket.teaPrice.toFixed(2)}`
                }
                Text {
                    objectName: "teaCount"
                    anchors.left: parent.left
                    anchors.leftMargin: 10
                    y: 32
                    color: look.muted1
                    font.size: 16
                    text: t`${basket.teaCount} in basket`
                }
                // The button is the area over the words, not their box, so
                // what it is called need not hold what they say.
                PointerArea {
                    anchors.fill: parent
                    Accessible.name: t`Add tea`
                    Accessible.role: Accessible.Button
                    cursorShape: Cursor.PointingHand
                    onClicked: basket.addTea()
                }
            }
            Rectangle {
                objectName: "breadButton"
                width: 140
                height: 58
                radius: 8
                fill: look.raised
                Text {
                    anchors.left: parent.left
                    anchors.leftMargin: 10
                    y: 8
                    color: look.ink2
                    font.size: 18
                    text: t`Bread · £${basket.breadPrice.toFixed(2)}`
                }
                Text {
                    objectName: "breadCount"
                    anchors.left: parent.left
                    anchors.leftMargin: 10
                    y: 32
                    color: look.muted1
                    font.size: 16
                    text: t`${basket.breadCount} in basket`
                }
                // The button is the area over the words, not their box, so
                // what it is called need not hold what they say.
                PointerArea {
                    anchors.fill: parent
                    Accessible.name: t`Add bread`
                    Accessible.role: Accessible.Button
                    cursorShape: Cursor.PointingHand
                    onClicked: basket.addBread()
                }
            }
            Rectangle {
                objectName: "jamButton"
                width: 140
                height: 58
                radius: 8
                fill: look.raised
                Text {
                    anchors.left: parent.left
                    anchors.leftMargin: 10
                    y: 8
                    color: look.ink2
                    font.size: 18
                    text: t`Jam · £${basket.jamPrice.toFixed(2)}`
                }
                Text {
                    objectName: "jamCount"
                    anchors.left: parent.left
                    anchors.leftMargin: 10
                    y: 32
                    color: look.muted1
                    font.size: 16
                    text: t`${basket.jamCount} in basket`
                }
                // The button is the area over the words, not their box, so
                // what it is called need not hold what they say.
                PointerArea {
                    anchors.fill: parent
                    Accessible.name: t`Add jam`
                    Accessible.role: Accessible.Button
                    cursorShape: Cursor.PointingHand
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
            font.size: 16
            text: t`Add an item, then edit the code. Your basket stays.`
        }
    }
}
