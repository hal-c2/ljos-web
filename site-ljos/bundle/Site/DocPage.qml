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
// Each block's delegate carries every kind's face and shows its
// own, all of it bound where it stands. A `Loader` whose component
// is itself a binding loads after the delegate is made, which a
// browser settles over its frames and a prerender — writing the
// page as it first stands — does not: the page would read whole
// only with script. Bound where they stand, the blocks are there
// as the page is made, on either side of hydration alike.
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
    property int textWidth: width

    // The flickable that holds this column, named by the shell so a
    // contents press can land on its heading.
    property var scroller: null

    function scrollToAnchor(anchor) {
        if (!doc.scroller)
            return;
        for (var i = 0; i < blocks.count; i++) {
            var item = blocks.itemAt(i);
            if (item && item.anchor === anchor) {
                var at = item.mapToItem(doc.scroller.contentItem, 0, 0);
                doc.scroller.contentY = Math.max(0, at.y - 12);
                return;
            }
        }
    }

    function follow(link) {
        var hash = link.indexOf("#");
        var route = hash >= 0 ? link.slice(0, hash) : link;
        var anchor = hash >= 0 ? link.slice(hash + 1) : "";
        if (anchor && (route === "" || (doc.page && route === doc.page.route))) {
            doc.scrollToAnchor(anchor);
            return;
        }
        Nav.go(link);
    }

    spacing: 14

    Text {
        width: parent.width
        visible: !doc.page
        text: "There is no page at this address. The docs begin at What is Ljós?"
        color: Theme.ink
        font.family: Theme.sans
        font.pixelSize: 15
        wrapMode: Text.Wrap
    }
    Text {
        width: parent.width
        text: doc.page ? doc.page.title : ""
        color: Theme.ink
        font.family: Theme.serif
        font.pixelSize: 34
        font.bold: true
        wrapMode: Text.Wrap
    }
    Text {
        width: parent.width
        visible: text !== ""
        text: doc.page ? doc.page.description : ""
        color: Theme.muted
        font.family: Theme.sans
        font.pixelSize: 15
        wrapMode: Text.Wrap
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

            width: doc.textWidth
            spacing: 0

            // A heading.
            Text {
                visible: kind === "heading"
                width: doc.textWidth
                text: kind === "heading" ? modelData.rich : ""
                textFormat: Text.RichText
                color: Theme.ink
                font.family: (modelData.level || 2) <= 2 ? Theme.serif : Theme.sans
                font.pixelSize: modelData.level === 1 ? 30 : modelData.level === 2 ? 24 : modelData.level === 3 ? 19 : 16
                font.bold: true
                wrapMode: Text.Wrap
                onLinkActivated: (link) => doc.follow(link)
            }
            // Prose.
            Text {
                visible: kind === "para"
                width: doc.textWidth
                text: kind === "para" ? modelData.rich : ""
                textFormat: Text.RichText
                color: Theme.ink
                font.family: Theme.sans
                font.pixelSize: 15
                wrapMode: Text.Wrap
                onLinkActivated: (link) => doc.follow(link)
            }
            // A list.
            Column {
                visible: kind === "list"
                width: doc.textWidth
                spacing: 6

                Repeater {
                    model: kind === "list" ? modelData.items : []
                    Row {
                        required property var modelData
                        required property int index
                        width: doc.textWidth
                        spacing: 8

                        Text {
                            text: blockItem.modelData.ordered ? (index + 1) + "." : "•"
                            color: Theme.accent
                            font.family: Theme.sans
                            font.pixelSize: 15
                            font.bold: true
                        }
                        Text {
                            width: doc.textWidth - 28
                            text: modelData
                            textFormat: Text.RichText
                            color: Theme.ink
                            font.family: Theme.sans
                            font.pixelSize: 15
                            wrapMode: Text.Wrap
                            onLinkActivated: (link) => doc.follow(link)
                        }
                    }
                }
            }
            // A table: its head row, then its rows, the columns
            // sharing the page's width.
            Column {
                id: table
                visible: kind === "table"
                width: doc.textWidth
                spacing: 0

                readonly property var head: kind === "table" ? modelData.head : []
                readonly property var rows: kind === "table" ? modelData.rows : []
                readonly property int cols: Math.max(1, head.length)
                readonly property int cellWidth: Math.floor(width / cols)

                Row {
                    Repeater {
                        model: table.head
                        Rectangle {
                            required property var modelData
                            width: table.cellWidth
                            height: cellText.implicitHeight + 12
                            color: Theme.panel
                            border.color: Theme.border
                            border.width: 1
                            Text {
                                id: cellText
                                anchors.left: parent.left
                                anchors.right: parent.right
                                anchors.top: parent.top
                                anchors.margins: 6
                                text: modelData
                                textFormat: Text.RichText
                                color: Theme.ink
                                font.family: Theme.sans
                                font.pixelSize: 13
                                font.bold: true
                                wrapMode: Text.Wrap
                                onLinkActivated: (link) => doc.follow(link)
                            }
                        }
                    }
                }
                Repeater {
                    model: table.rows
                    Row {
                        required property var modelData
                        Repeater {
                            model: parent.modelData
                            Rectangle {
                                required property var modelData
                                width: table.cellWidth
                                height: bodyText.implicitHeight + 12
                                color: Theme.bg
                                border.color: Theme.border
                                border.width: 1
                                Text {
                                    id: bodyText
                                    anchors.left: parent.left
                                    anchors.right: parent.right
                                    anchors.top: parent.top
                                    anchors.margins: 6
                                    text: modelData
                                    textFormat: Text.RichText
                                    color: Theme.ink
                                    font.family: Theme.sans
                                    font.pixelSize: 13
                                    wrapMode: Text.Wrap
                                    onLinkActivated: (link) => doc.follow(link)
                                }
                            }
                        }
                    }
                }
            }
            // Code, through the site's one code-block face.
            CodeBlock {
                visible: kind === "code"
                width: doc.textWidth
                lang: kind === "code" ? (modelData.lang || "") : ""
                code: kind === "code" ? (modelData.code || "") : ""
                rich: kind === "code" ? (modelData.rich || "") : ""
                harness: kind === "code" ? (modelData.harness || "") : ""
                file: kind === "code" ? (modelData.file || "") : ""
                group: kind === "code" ? (modelData.group || "") : ""
                before: kind === "code" ? (modelData.before || false) : false
            }
            // A quote, or an admonition the Markdown named.
            Rectangle {
                visible: kind === "quote"
                width: doc.textWidth
                height: kind === "quote" ? quoteText.implicitHeight + 20 : 0
                color: Theme.panel
                border.color: Theme.accent
                border.width: 1

                Text {
                    id: quoteText
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.top: parent.top
                    anchors.margins: 10
                    text: kind === "quote" ? ((modelData.note ? String(modelData.note).toUpperCase() + " — " : "") + modelData.rich) : ""
                    textFormat: Text.RichText
                    color: Theme.ink
                    font.family: Theme.sans
                    font.pixelSize: 14
                    wrapMode: Text.Wrap
                    onLinkActivated: (link) => doc.follow(link)
                }
            }
            // A picture, with the words that say what it is.
            Column {
                visible: kind === "image"
                width: doc.textWidth
                spacing: 6

                Image {
                    Accessible.name: kind === "image" ? (modelData.alt || "") : ""
                    source: kind === "image" ? (modelData.src || "") : ""
                    width: Math.min(implicitWidth > 0 ? implicitWidth : 320, doc.textWidth)
                    height: implicitWidth > 0 ? width * implicitHeight / implicitWidth : 180
                    fillMode: Image.PreserveAspectFit
                }
                Text {
                    width: doc.textWidth
                    visible: text !== ""
                    text: kind === "image" ? (modelData.alt || "") : ""
                    color: Theme.muted
                    font.family: Theme.sans
                    font.pixelSize: 12
                    wrapMode: Text.Wrap
                }
            }
            // A rule.
            Rectangle {
                visible: kind === "rule"
                width: doc.textWidth
                height: 1
                color: Theme.border
            }
        }
    }
}
