import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Site

// A surface that stands off the page in the shell's own way: rounded
// with a hairline, a long soft shadow under it in the light and a faint
// glow at its edge in the dark (Elegant); square corner brackets
// (Cyberpunk); flat (Workbench, Desktop). What it holds goes in its
// `content`, `padding` in from its edge.
Item {
    id: panel

    default property alias content: inner.data
    property int padding: Theme.l
    property color color: Theme.surface
    property int radius: Theme.radiusLarge
    // Whether it lifts off the page: a card does, a box inside one does not.
    property bool raised: true
    readonly property int innerWidth: width - 2 * padding

    implicitHeight: inner.implicitHeight + 2 * padding

    RectangularShadow {
        visible: panel.raised && Theme.shadowBlur > 0
        anchors.fill: parent
        radius: panel.radius
        offset.y: Theme.shadowY
        blur: Theme.shadowBlur
        // Tucked in, so the shadow falls under the panel rather than
        // around it.
        spread: -Math.round(Theme.shadowBlur / 4)
        color: Theme.shadow
    }
    RectangularShadow {
        visible: panel.raised && !Theme.brackets
        anchors.fill: parent
        radius: panel.radius
        blur: 32
        color: Theme.glow
    }
    Rectangle {
        anchors.fill: parent
        radius: Theme.brackets ? 0 : panel.radius
        fill: panel.color
        border.color: Theme.brackets ? "transparent" : Theme.divider
        border.width: 1
    }
    // Cyberpunk's corners: an L at each, in the accent.
    Repeater {
        model: Theme.brackets ? 4 : 0
        Item {
            id: corner
            required property int index
            readonly property bool atRight: index === 1 || index === 2
            readonly property bool atBottom: index >= 2
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (App.layoutDirection).
            readonly property real startX: atRight ? panel.width - width : 0
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            y: atBottom ? panel.height - height : 0
            width: 14
            height: 14
            Rectangle {
                y: corner.atBottom ? corner.height - 2 : 0
                width: parent.width
                height: 2
                fill: Theme.accent
            }
            Rectangle {
                // Where it starts, read from the left; a right-to-left page
                // sets it as far from the right (App.layoutDirection).
                readonly property real startX: corner.atRight ? corner.width - 2 : 0
                x: App.layoutDirection === Direction.RightToLeft ? corner.width - width - startX : startX
                width: 2
                height: parent.height
                fill: Theme.accent
            }
        }
    }
    Column {
        id: inner
        // Where it starts, read from the left; a right-to-left page
        // sets it as far from the right (App.layoutDirection).
        readonly property real startX: panel.padding
        x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
        y: panel.padding
        width: panel.innerWidth
    }
}
