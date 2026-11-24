import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Site

// The showcase: apps built with Ljós, each recorded as it runs. The
// apps are data (Showcase/products.json, carried in ShowcaseApps.apps),
// so another is another entry and its files, and no app is named here.
Column {
    id: showcase

    // Wide or not as it is made, from what loads it (PageView's Loader
    // says), so a phone never lays out the wide page first and then again.
    property bool wide: parent && parent.wide !== undefined ? parent.wide : true
    // What the page scrolls in (PageView sets it once loaded).
    property var scroller: null

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
            font.size: showcase.wide ? Theme.displaySize : Theme.compactDisplaySize
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: showcase.wide ? Theme.displayLine : Theme.compactDisplayLine
            wrap: Text.Wrap
            readonly property int headingLevel: 1
            Accessible.role: Accessible.Heading
        }
        Text {
            width: Math.min(parent.width, Theme.measure)
            text: t`Apps that run on Ljós today, recorded as they run. Each capture says what it shows about Ljós, and each app links to its source.`
            color: Theme.textMuted
            font.family: Theme.sans
            font.size: Theme.subtitleSize - 1
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.subtitleLine - 2
            wrap: Text.Wrap
        }
    }

    Repeater {
        model: ShowcaseApps.apps
        ShowcaseApp {
            required property unknown modelData
            product: modelData
            width: showcase.width
            wide: showcase.wide
            scroller: showcase.scroller
        }
    }
}
