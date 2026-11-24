// Ljós's Core before QtQuick: only its t`` is wanted here, and any name
// both have stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import Site

// Apps and tools built with Ljós, a card each: a capture of it running
// (bundle/assets/built-*, served from /pictures/), what it is in a line
// or two, and where its source is. The front page shows them all, the
// showcase the ones it has no recording of. Each picture is a capture
// of the real app; none is drawn for the site.
Grid {
    id: built

    // Which to show, by name, in this order.
    property var names: ["studio", "eldur", "hof"]
    property bool wide: true
    // The page's route, which the pictures' addresses are written from.
    property string route: "/"
    signal followed(string href)

    readonly property var all: ({
        studio: {
            title: t`Ljós Studio`,
            href: "https://github.com/hal-c2/ljos-studio",
            body: t`A visual designer where the design is the app’s own QML. A change on the canvas leaves the rest of the file as it was, and agents drive Studio through MCP.`,
            picture: "/pictures/built-studio",
            pictureDark: "/pictures/built-studio-dark",
            alt: t`Ljós Studio with a rectangle selected on the canvas: the layers on the left, its properties on the right and its QML under the canvas.`
        },
        eldur: {
            title: t`Eldur`,
            href: "https://github.com/hal-c2/eldur",
            body: t`Turns a static HTML, CSS and JavaScript page into a runnable QML app you can read and edit. What it can’t convert, it reports.`,
            picture: "/pictures/built-eldur",
            pictureDark: "",
            alt: t`A recipe card for red lentil soup, converted from a web page by Eldur and running on Ljós.`
        },
        hof: {
            title: t`Ljós Hof`,
            href: "https://github.com/hal-c2/ljos-hof",
            body: t`A terminal for Linux and macOS, with tabs, splits and one small config file. It tells you when an agent in a pane is waiting for you. The <a href="/showcase/">showcase</a> shows it running.`,
            picture: "/pictures/built-hof",
            pictureDark: "/pictures/built-hof-dark",
            alt: t`Ljós Hof with two panes side by side: git log in the focused one on the left, a directory listing on the right.`
        }
    })
    readonly property var shown: names.map((name) => all[name])
    readonly property int cardWidth: Math.floor((width - (columns - 1) * columnSpacing) / columns)
    // Cards side by side share the tallest one's height.
    readonly property real tallest: {
        var most = 0;
        for (var i = 0; i < cards.count; ++i) {
            var card = cards.itemAt(i);
            if (card)
                most = Math.max(most, card.contentHeight);
        }
        return most;
    }

    columns: wide ? Math.min(3, shown.length) : 1
    columnSpacing: Theme.l
    rowSpacing: Theme.l

    Repeater {
        id: cards
        model: built.shown
        FeatureCard {
            required property var modelData
            width: built.cardWidth
            height: built.columns > 1 ? built.tallest : contentHeight
            title: modelData.title
            href: modelData.href
            body: modelData.body
            picture: modelData.picture
            pictureDark: modelData.pictureDark
            pictureAlt: modelData.alt
            route: built.route
            onFollowed: (link) => built.followed(link)
        }
    }
}
