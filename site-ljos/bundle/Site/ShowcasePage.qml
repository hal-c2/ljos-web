// Ljós's Core before QtQuick: only its t`` is wanted here, and any name
// both have stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import Site

// The showcase: apps built with Ljós, each recorded as it runs. The
// apps are data (Showcase/products.json, carried in Content.showcase),
// so another is another entry and its files, and no app is named here.
Column {
    id: showcase

    property var scroller: null
    property bool wide: true

    width: parent ? parent.width : 680
    spacing: showcase.wide ? Theme.xxxl + Theme.l : Theme.xxl
    topPadding: showcase.wide ? Theme.xl : Theme.m

    Column {
        width: parent.width
        spacing: Theme.s

        Text {
            width: parent.width
            text: t`Built with Ljós`
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: showcase.wide ? Theme.displaySize : Theme.compactDisplaySize
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: showcase.wide ? Theme.displayLine : Theme.compactDisplayLine
            wrapMode: Text.Wrap
            readonly property int headingLevel: 1
            Accessible.role: Accessible.Heading
        }
        Text {
            width: Math.min(parent.width, Theme.measure)
            text: t`Apps that run on Ljós today, recorded as they run. Each capture says what it shows about Ljós, and each app links to its source.`
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.subtitleSize - 1
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.subtitleLine - 2
            wrapMode: Text.Wrap
        }
    }

    Repeater {
        model: Content.showcase
        ShowcaseApp {
            required property var modelData
            product: modelData
            width: showcase.width
            wide: showcase.wide
        }
    }
}
