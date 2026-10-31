import QtQuick
import Shop

// The site's own shell, built with the page: what a visitor's shell
// replaces, and what Reset brings back.
Column {
    objectName: "shell"
    Basket {
        id: basket
        objectName: "basket"
    }
    Later {}
    Text {
        objectName: "label"
        text: "Default " + basket.count
    }
    Rectangle {
        id: swatch
        objectName: "swatch"
        width: 40
        height: 20
        color: "red"
    }
}
