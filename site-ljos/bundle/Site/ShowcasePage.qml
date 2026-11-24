import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import "logic/place.ts" as Place
import Site
import "../nav.js" as Nav

// The showcase: apps built with Ljós, each recorded as it runs. The
// apps are data (Showcase/products.json, carried in ShowcaseApps.apps),
// so another is another entry and its files, and no app is named here.
Column {
    id: showcase

    // Wide or not as it is made, from what loads it (PageView's Loader
    // says), so a phone never lays out the wide page first and then again.
    property bool wide: Place.wideIn(parent)
    // What the page scrolls in (PageView sets it once loaded).
    property Flickable scroller

    width: parent !== null ? parent.width : 680
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
        model: ShowcaseBuilt.apps
        ShowcaseApp {
            required property unknown modelData
            product: modelData
            width: showcase.width
            wide: showcase.wide
            scroller: showcase.scroller
        }
    }

    // The tools built with Ljós that have no recording here: a capture
    // of each and its source (BuiltWith.qml, as the front page has them).
    Column {
        width: parent.width
        spacing: Theme.l

        Text {
            width: parent.width
            text: t`Tools built with Ljós`
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: showcase.wide ? Theme.headlineSize + 4 : Theme.headlineSize - 2
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: showcase.wide ? Theme.headlineLine + 4 : Theme.headlineLine - 4
            wrapMode: Text.Wrap
            readonly property int headingLevel: 2
            Accessible.role: Accessible.Heading
        }
        BuiltWith {
            width: parent.width
            names: ["studio", "eldur"]
            wide: showcase.wide
            route: "/showcase/"
            onFollowed: (link) => Nav.go(link)
        }
    }
}
