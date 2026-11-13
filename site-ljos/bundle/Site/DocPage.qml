import QtQuick
import Site
import "../nav.js" as Nav

// One docs page: its title, what it is about, then its blocks in
// order — headings a contents list can land on, prose, lists,
// tables, pictures and code. The blocks are the Markdown source's
// (`ljos-web/markdown`), read at build time; this page only shows
// them. Every block is made whether or not it is on screen, so a
// prerendered page holds the whole text for a reader with no script.
//
// Each block makes only its own kind's face: a Repeater of one for
// that kind, none for the others. A Repeater makes its delegates as
// it is made, so the block is there as the page is made, in a
// prerender as in a browser; a `Loader` whose component is a binding
// would load a frame later, after a prerender has written the page.
Column {
    id: doc

    // The page this route names, read where it stands: known as
    // the page is made, in a prerender as in a browser.
    property string route: "/"
    readonly property var page: {
        for (var i = 0; i < Content.pages.length; i++) {
            if (Content.pages[i].route === route)
                return Content.pages[i];
        }
        return null;
    }
    readonly property bool narrow: width < 600

    // The flickable that holds this column, named by the shell so a
    // contents press can land on its heading.
    property var scroller: null

    // A link in the page's text, for the shell to follow.
    signal followed(string href)

    function scrollToAnchor(anchor) {
        if (!doc.scroller)
            return;
        for (var i = 0; i < blocks.count; i++) {
            var item = blocks.itemAt(i);
            if (item && item.anchor === anchor) {
                var at = item.mapToItem(doc.scroller.contentItem, 0, 0);
                doc.scroller.contentY = Math.max(0, Math.min(at.y - Theme.l, doc.scroller.contentHeight - doc.scroller.height));
                return;
            }
        }
    }

    spacing: Theme.m

    Text {
        width: parent.width
        visible: !doc.page && doc.route !== ""
        textFormat: Text.RichText
        text: "There is no page at this address. The docs begin at " + Nav.anchor("/start/", "What is Ljós?", true) + "."
        color: Theme.text
        linkColor: Theme.link
        font.family: Theme.sans
        font.pixelSize: Theme.bodySize
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.bodyLine
        wrapMode: Text.Wrap
        onLinkActivated: (link) => doc.followed(link)
    }
    Column {
        width: parent.width
        visible: doc.page !== null
        spacing: Theme.s
        bottomPadding: Theme.s

        Text {
            width: parent.width
            text: doc.page ? doc.page.title : ""
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: doc.narrow ? Theme.compactDisplaySize : Theme.displaySize
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: doc.narrow ? Theme.compactDisplayLine : Theme.displayLine
            wrapMode: Text.Wrap
            Accessible.role: Accessible.Heading
        }
        Text {
            width: parent.width
            visible: text !== ""
            text: doc.page ? (doc.page.description || "") : ""
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.subtitleSize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.subtitleLine
            wrapMode: Text.Wrap
        }
    }

    Repeater {
        id: blocks
        model: doc.page ? doc.page.blocks : []

        Column {
            id: blockItem

            required property var modelData
            required property int index

            readonly property string kind: String(modelData.kind)
            readonly property string anchor: kind === "heading" ? String(modelData.anchor) : ""

            width: doc.width
            spacing: 0

            // A heading: space above it, more for a bigger one.
            Repeater {
                model: blockItem.kind === "heading" ? 1 : 0
                Text {
                    readonly property int level: blockItem.modelData.level || 2
                    width: doc.width
                    topPadding: level <= 2 ? Theme.xl : Theme.m
                    text: blockItem.modelData.rich
                    textFormat: Text.RichText
                    color: Theme.text
                    linkColor: Theme.link
                    font.family: Theme.sans
                    font.pixelSize: level <= 2 ? Theme.headlineSize - (doc.narrow ? 4 : 0) : level === 3 ? Theme.subtitleSize : Theme.bodySize
                    font.weight: level <= 3 ? Font.DemiBold : Font.Bold
                    lineHeightMode: Text.FixedHeight
                    lineHeight: level <= 2 ? Theme.headlineLine - (doc.narrow ? 4 : 0) : level === 3 ? Theme.subtitleLine : Theme.bodyLine
                    wrapMode: Text.Wrap
                    Accessible.role: Accessible.Heading
                    onLinkActivated: (link) => doc.followed(link)
                }
            }
            // Prose.
            Repeater {
                model: blockItem.kind === "para" ? 1 : 0
                Text {
                    width: doc.width
                    text: blockItem.modelData.rich
                    textFormat: Text.RichText
                    color: Theme.text
                    linkColor: Theme.link
                    font.family: Theme.sans
                    font.pixelSize: Theme.bodySize
                    lineHeightMode: Text.FixedHeight
                    lineHeight: Theme.bodyLine + Theme.xxs
                    wrapMode: Text.Wrap
                    onLinkActivated: (link) => doc.followed(link)
                }
            }
            // A list.
            Repeater {
                model: blockItem.kind === "list" ? 1 : 0
                Column {
                    width: doc.width
                    spacing: Theme.xs

                    Repeater {
                        model: blockItem.modelData.items
                        Row {
                            required property var modelData
                            required property int index
                            width: doc.width
                            spacing: Theme.xs

                            Text {
                                width: blockItem.modelData.ordered ? 24 : 16
                                horizontalAlignment: Text.AlignRight
                                text: blockItem.modelData.ordered ? (index + 1) + "." : "•"
                                color: Theme.textMuted
                                font.family: Theme.sans
                                font.pixelSize: Theme.bodySize
                                lineHeightMode: Text.FixedHeight
                                lineHeight: Theme.bodyLine + Theme.xxs
                                Accessible.ignored: true
                            }
                            Text {
                                width: doc.width - (blockItem.modelData.ordered ? 24 : 16) - Theme.xs
                                text: modelData
                                textFormat: Text.RichText
                                color: Theme.text
                                linkColor: Theme.link
                                font.family: Theme.sans
                                font.pixelSize: Theme.bodySize
                                lineHeightMode: Text.FixedHeight
                                lineHeight: Theme.bodyLine + Theme.xxs
                                wrapMode: Text.Wrap
                                onLinkActivated: (link) => doc.followed(link)
                            }
                        }
                    }
                }
            }
            // A table: its head row, then its rows, the columns sharing
            // the page's width; a narrow page scrolls it sideways.
            Repeater {
                model: blockItem.kind === "table" ? 1 : 0
                Rectangle {
                    id: tableFrame
                    readonly property var head: blockItem.modelData.head
                    readonly property var rows: blockItem.modelData.rows
                    readonly property int cols: Math.max(1, head.length)
                    readonly property int cellWidth: Math.max(140, Math.floor((doc.width - 2) / cols))

                    width: doc.width
                    height: table.height + 2
                    radius: Theme.radius
                    color: Theme.canvas
                    border.color: Theme.divider
                    border.width: 1
                    clip: true

                    Flickable {
                        x: 1
                        y: 1
                        width: parent.width - 2
                        height: table.height
                        contentWidth: table.width
                        contentHeight: table.height
                        flickableDirection: Flickable.HorizontalFlick
                        clip: true

                        Column {
                            id: table

                            Row {
                                Repeater {
                                    model: tableFrame.head
                                    Rectangle {
                                        required property var modelData
                                        width: tableFrame.cellWidth
                                        height: headRow.height
                                        color: Theme.surface
                                        Text {
                                            id: headCell
                                            x: Theme.s
                                            y: Theme.xs
                                            width: parent.width - 2 * Theme.s
                                            text: modelData
                                            textFormat: Text.RichText
                                            color: Theme.text
                                            linkColor: Theme.link
                                            font.family: Theme.sans
                                            font.pixelSize: Theme.captionSize + 1
                                            font.weight: Font.DemiBold
                                            lineHeightMode: Text.FixedHeight
                                            lineHeight: Theme.captionLine
                                            wrapMode: Text.Wrap
                                            onLinkActivated: (link) => doc.followed(link)
                                        }
                                    }
                                }
                                id: headRow
                                height: {
                                    var tallest = 0;
                                    for (var i = 0; i < children.length; i++) {
                                        var cell = children[i].children[0];
                                        if (cell)
                                            tallest = Math.max(tallest, cell.implicitHeight);
                                    }
                                    return tallest + 2 * Theme.xs;
                                }
                            }
                            Repeater {
                                model: tableFrame.rows
                                Row {
                                    id: bodyRow
                                    required property var modelData
                                    height: {
                                        var tallest = 0;
                                        for (var i = 0; i < children.length; i++) {
                                            var cell = children[i].children[1];
                                            if (cell)
                                                tallest = Math.max(tallest, cell.implicitHeight);
                                        }
                                        return tallest + 2 * Theme.xs + 1;
                                    }
                                    Repeater {
                                        model: bodyRow.modelData
                                        Item {
                                            required property var modelData
                                            width: tableFrame.cellWidth
                                            height: bodyRow.height
                                            Rectangle {
                                                width: parent.width
                                                height: 1
                                                color: Theme.divider
                                            }
                                            Text {
                                                x: Theme.s
                                                y: Theme.xs + 1
                                                width: parent.width - 2 * Theme.s
                                                text: modelData
                                                textFormat: Text.RichText
                                                color: Theme.text
                                                linkColor: Theme.link
                                                font.family: Theme.sans
                                                font.pixelSize: Theme.captionSize + 1
                                                lineHeightMode: Text.FixedHeight
                                                lineHeight: Theme.captionLine
                                                wrapMode: Text.Wrap
                                                onLinkActivated: (link) => doc.followed(link)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // Code, through the site's one code-block face: plain,
            // or live where the build ran it.
            Repeater {
                model: blockItem.kind === "code" || blockItem.kind === "live" ? 1 : 0
                CodeBlock {
                    readonly property bool isCode: blockItem.kind === "code"
                    width: doc.width
                    lang: blockItem.modelData.lang || ""
                    code: isCode ? (blockItem.modelData.code || "") : ""
                    rich: blockItem.modelData.rich || ""
                    harness: isCode ? (blockItem.modelData.harness || "") : ""
                    file: isCode ? (blockItem.modelData.file || "") : ""
                    group: isCode ? (blockItem.modelData.group || "") : ""
                    before: isCode ? (blockItem.modelData.before || false) : false
                    live: isCode ? null : blockItem.modelData.live
                }
            }
            // A quote, or an admonition the Markdown named: a bar of
            // the accent beside it, and its kind said first.
            Repeater {
                model: blockItem.kind === "quote" ? 1 : 0
                Rectangle {
                    width: doc.width
                    height: quoteWords.implicitHeight + 2 * Theme.m
                    radius: Theme.radiusSmall
                    color: Theme.surface
                    border.color: Theme.divider
                    border.width: 1

                    Rectangle {
                        width: 4
                        height: parent.height
                        radius: 2
                        color: Theme.accent
                    }
                    Column {
                        id: quoteWords
                        x: Theme.l
                        y: Theme.m
                        width: parent.width - Theme.l - Theme.m
                        spacing: Theme.xxs

                        Text {
                            visible: !!blockItem.modelData.note
                            text: blockItem.modelData.note ? String(blockItem.modelData.note).charAt(0).toUpperCase() + String(blockItem.modelData.note).slice(1) : ""
                            color: Theme.link
                            font.family: Theme.sans
                            font.pixelSize: Theme.captionSize
                            font.weight: Font.Bold
                            lineHeightMode: Text.FixedHeight
                            lineHeight: Theme.captionLine
                        }
                        Text {
                            width: parent.width
                            text: blockItem.modelData.rich
                            textFormat: Text.RichText
                            color: Theme.text
                            linkColor: Theme.link
                            font.family: Theme.sans
                            font.pixelSize: Theme.bodySize
                            lineHeightMode: Text.FixedHeight
                            lineHeight: Theme.bodyLine
                            wrapMode: Text.Wrap
                            onLinkActivated: (link) => doc.followed(link)
                        }
                    }
                }
            }
            // A picture, with the words that say what it is.
            Repeater {
                model: blockItem.kind === "image" ? 1 : 0
                Column {
                    width: doc.width
                    spacing: Theme.xs

                    Image {
                        Accessible.name: blockItem.modelData.alt || ""
                        source: blockItem.modelData.src || ""
                        width: Math.min(implicitWidth > 0 ? implicitWidth : doc.width, doc.width)
                        height: implicitWidth > 0 ? width * implicitHeight / implicitWidth : Math.round(doc.width * 9 / 16)
                        fillMode: Image.PreserveAspectFit
                    }
                    Text {
                        width: doc.width
                        visible: text !== ""
                        text: blockItem.modelData.alt || ""
                        color: Theme.textMuted
                        font.family: Theme.sans
                        font.pixelSize: Theme.captionSize
                        lineHeightMode: Text.FixedHeight
                        lineHeight: Theme.captionLine
                        wrapMode: Text.Wrap
                    }
                }
            }
            // A rule.
            Repeater {
                model: blockItem.kind === "rule" ? 1 : 0
                Item {
                    width: doc.width
                    height: Theme.l
                    Rectangle {
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width
                        height: 1
                        color: Theme.divider
                    }
                }
            }
        }
    }
}
