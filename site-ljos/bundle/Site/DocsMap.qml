import QtQuick
import Site

// The docs, section by section, in the order their front matter puts
// them: the sidebar on a wide page, and the menu's on a narrow one. The
// page being read is the strong one.
Column {
    id: map

    property string route: ""

    spacing: Theme.l

    Repeater {
        model: Content.sidebar

        Column {
            required property var modelData

            width: map.width
            spacing: Theme.xxs

            Text {
                width: parent.width
                text: modelData.label
                color: Theme.text
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
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
                    height: words.implicitHeight + Theme.xs
                    radius: Theme.radiusSmall
                    color: current ? Theme.surfaceSelected : "transparent"

                    NavLink {
                        id: words
                        x: Theme.xs
                        y: Theme.xxs
                        width: parent.width - 2 * Theme.xs
                        label: modelData.title
                        href: modelData.route
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
