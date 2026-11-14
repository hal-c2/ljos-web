import QtQuick
import Site

// Under every page: what Ljós is in a line, where to go, and its licence.
Rectangle {
    id: footer
    Accessible.role: Accessible.Footer

    property int gutter: Theme.gutterWide
    property int measure: Theme.pageWidth

    height: inner.implicitHeight + 2 * Theme.xl
    color: Theme.surface

    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        height: 1
        color: Theme.divider
    }

    Column {
        id: inner
        width: Math.min(footer.measure, footer.width - 2 * footer.gutter)
        x: Math.round((footer.width - width) / 2)
        y: Theme.xl
        spacing: Theme.s

        Row {
            spacing: Theme.xs
            Image {
                width: 20
                height: 20
                anchors.verticalCenter: parent.verticalCenter
                source: "../assets/ljos-mark.svg"
                sourceSize: Qt.size(20, 20)
                Accessible.ignored: true
            }
            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: "Ljós — malleable software, everywhere"
                color: Theme.text
                font.family: Theme.sans
                font.pixelSize: Theme.bodySize
                font.weight: Font.DemiBold
            }
        }
        Flow {
            width: parent.width
            spacing: Theme.l

            NavLink { label: "Docs"; href: "/start/"; muted: true; size: Theme.captionSize + 1; line: Theme.captionLine }
            NavLink { label: "Demos"; href: "/demos/"; muted: true; size: Theme.captionSize + 1; line: Theme.captionLine }
            NavLink { label: "Your first app"; href: "/start/first-app/"; muted: true; size: Theme.captionSize + 1; line: Theme.captionLine }
            NavLink { label: "GitHub"; href: "https://github.com/hal-c2/ljos-ui"; muted: true; size: Theme.captionSize + 1; line: Theme.captionLine }
        }
        Text {
            width: parent.width
            text: "MIT licensed. This site is itself a Ljós app, written out as HTML at build time and brought to life in the page."
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.captionLine
            wrapMode: Text.Wrap
        }
    }
}
