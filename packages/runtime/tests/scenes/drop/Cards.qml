import QtQuick
import Shop

// The site's own uses of one block: unnamed, one after another and in a
// Repeater's delegates.
Column {
    objectName: "cards"
    Card {}
    Card {}
    Repeater {
        model: 2
        Card {}
    }
}
