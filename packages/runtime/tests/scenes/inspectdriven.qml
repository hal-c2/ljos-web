import QtQuick
import QtQuick.Templates as T

// An app that is a part of a page (`app`), with a popup of its own, and a
// menu the page has open beside it (`menu`, in `holder`).
Item {
    id: root
    width: 400; height: 300

    Rectangle {
        id: app
        width: 200; height: 200
        color: "white"
        MouseArea {
            id: hit
            anchors.fill: parent
            property int hits: 0
            onClicked: hits++
        }
        T.Popup {
            id: own
            x: 10; y: 10; width: 50; height: 50
            closePolicy: T.Popup.CloseOnEscape | T.Popup.CloseOnPressOutside
        }
        // A popup a press closes, by its own handler, before the release.
        T.Popup {
            id: closer
            x: 100; y: 100; width: 50; height: 50
            closePolicy: T.Popup.CloseOnEscape
            contentItem: MouseArea {
                onPressed: closer.close()
            }
        }
    }
    Item {
        id: holder
        x: 250; width: 100; height: 40
        T.Popup {
            id: menu
            y: 40; width: 100; height: 100
            closePolicy: T.Popup.CloseOnEscape | T.Popup.CloseOnPressOutsideParent
        }
    }
}
