import QtQuick
import Ljos.Blocks

// A page with a part made as it settles, not while its root is made: a
// ShellLoader puts its fallback in once the page is made. Two of it
// hydrated at once settle at once.
Column {
    Text { text: "A page of its own" }
    Rectangle { width: 120; height: 20; color: "steelblue" }
    ShellLoader {
        width: 200
        height: 40
        fallback: settled
    }
    Component {
        id: settled
        Rectangle {
            width: 200
            height: 40
            color: "honeydew"
            Text { text: "Made as the page settles" }
        }
    }
}
