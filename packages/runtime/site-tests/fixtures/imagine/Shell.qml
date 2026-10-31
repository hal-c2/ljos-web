import QtQuick
import QtQuick.Controls.Imagine

// A style Ljós has none of: only an installed Qt has it.
Column {
    Button { id: go; text: "Go" }
    Text { text: "imagine " + go.width + " " + go.height }
}
