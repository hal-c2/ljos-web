import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Site
import "logic/made.ts" as Made

// Apps and tools built with Ljós, a card each: a capture of it running
// (bundle/assets/built-*, served from /pictures/), what it is in a line
// or two, and where its source is. The front page shows them all, the
// showcase the ones it has no recording of. Each picture is a capture
// of the real app; none is drawn for the site.
Grid {
    id: built

    // Which to show, by name, in this order.
    property list<string> names: ["studio", "eldur", "hof", "halc2"]
    property bool wide: true
    // The page's route, which the pictures' addresses are written from.
    property string route: "/"
    signal followed(string href)

    readonly property list<Made.Made> all: [
        {
            name: "studio",
            title: t`Ljós Studio`,
            href: "https://github.com/hal-c2/ljos-studio",
            body: t`A visual designer where the design is the app’s own QML. A change on the canvas leaves the rest of the file as it was, and agents drive Studio through MCP.`,
            picture: "/pictures/built-studio",
            pictureDark: "/pictures/built-studio-dark",
            alt: t`Ljós Studio with a rectangle selected on the canvas: the layers on the left, its properties on the right and its QML under the canvas.`
        },
        {
            name: "eldur",
            title: t`Eldur`,
            href: "https://github.com/hal-c2/eldur",
            body: t`Turns a static HTML, CSS and JavaScript page into a runnable QML app you can read and edit. What it can’t convert, it reports.`,
            picture: "/pictures/built-eldur",
            pictureDark: "",
            alt: t`A recipe card for red lentil soup, converted from a web page by Eldur and running on Ljós.`
        },
        {
            name: "hof",
            title: t`Ljós Hof`,
            href: "https://github.com/hal-c2/ljos-hof",
            body: t`A terminal for Linux and macOS, with tabs, splits and one small config file. It tells you when an agent in a pane is waiting for you. The <a href="/showcase/">showcase</a> shows it running.`,
            picture: "/pictures/built-hof",
            pictureDark: "/pictures/built-hof-dark",
            alt: t`Ljós Hof with two panes side by side: git log in the focused one on the left, a directory listing on the right.`
        },
        {
            name: "halc2",
            title: t`HAL-C2`,
            href: "https://github.com/hal-c2/hal-c2",
            body: t`A control surface for the coding agents on your machine, with a terminal, browser tabs and a QML layout you can edit while it runs. Its <a href="/showcase/">Office plugin</a> is in the showcase.`,
            picture: "/pictures/built-halc2",
            pictureDark: "/pictures/built-halc2-dark",
            alt: t`HAL-C2’s Appearance settings on Ljós: settings sections down the left, System/Light/Dark color scheme options, and a list of themes with HAL-C2 chosen.`
        }
    ]
    readonly property list<Made.Made> shown: Made.pick(all, names)
    // Each card's height as it reports it, by its index: cards side by
    // side share the tallest one's.
    property list<real> heights: []
    readonly property real tallest: Made.tallest(heights)
    readonly property int cardWidth: Math.floor((width - (columns - 1) * columnSpacing) / columns)

    function report(at: int, height: real): void {
        heights = Made.withHeight(heights, shown.length, at, height);
    }

    columns: wide ? Made.columns(shown.length) : 1
    columnSpacing: Theme.l
    rowSpacing: Theme.l

    Repeater {
        model: built.shown
        FeatureCard {
            required property Made.Made modelData
            required property int index
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
            onContentHeightChanged: built.report(index, contentHeight)
            Component.onCompleted: built.report(index, contentHeight)
        }
    }
}
