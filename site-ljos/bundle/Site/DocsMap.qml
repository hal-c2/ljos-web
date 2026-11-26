pragma Scripts: JavaScript
import Ljos.Ui
import Ljos.Layout
import Ljos.Core
import Site

// The docs, section by section, in the order their front matter puts
// them: the sidebar on a wide page, and the menu's on a narrow one. The
// page being read is the strong one. Given `sections`, it is those (a
// workbench's tree of every page: Router.tree).
Column {
    id: map

    property string route: ""
    property var sections: Content.sidebar

    spacing: Theme.l

    Repeater {
        model: map.sections

        Column {
            required property var modelData

            width: map.width
            spacing: Theme.xxs

            Text {
                width: parent.width
                text: modelData.label
                color: Theme.text
                font.family: Theme.sans
                font.size: Theme.captionSize
                font.weight: Font.DemiBold
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.captionLine + Theme.xxs
            }
            Repeater {
                model: modelData.pages

                Rectangle {
                    required property var modelData

                    readonly property bool current: modelData.route === map.route

                    width: map.width
                    // A finger's row is the link from top to bottom.
                    height: Math.max(words.implicitHeight + Theme.xs, Theme.rowLeast)
                    radius: Theme.radiusSmall
                    fill: current ? Theme.surfaceSelected : "transparent"

                    NavLink {
                        id: words
                        // Where it starts, read from the left; a right-to-left page
                        // sets it as far from the right (LayoutMirroring).
                        readonly property real startX: Theme.xs
                        x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
                        y: Theme.narrow ? 0 : Theme.xxs
                        width: parent.width - 2 * Theme.xs
                        height: Theme.narrow ? parent.height : implicitHeight
                        label: modelData.title
                        to: modelData.route
                        current: parent.current
                        muted: !parent.current
                        size: Theme.captionSize + 1
                        line: Theme.captionLine
                    }
                }
            }
        }
    }
}
