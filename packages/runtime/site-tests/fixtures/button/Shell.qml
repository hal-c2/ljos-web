import QtQuick
import QtQuick.Controls

// A button, which the stand-in Qt (`qt-styles`) has too, and its size.
Column {
    Button { id: go; text: "Go" }
    Text { text: "button " + go.width + " " + go.height }
}
