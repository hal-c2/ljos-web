import Ljos.Core
import QtQuick
import Site
import "../Showcase/later.js" as Later
import "../nav.js" as Nav
import "../Showcase/media.js" as Media

// One app built with Ljós, as its entry in Showcase/products.json has
// it: who made it, what it is, a recording of it running, the captures
// that each say what they show about Ljós, and its source.
//
// The recording's poster is in the page as written, so it stands
// before any script runs and where none does. In the reader's browser
// the recording is made over it and fades in once it plays: at once
// where the reader allows motion, on Play where they ask for less. It
// plays only while it is on screen and its tab is shown, and a control
// under it pauses it whenever the reader wants it still.
Column {
    id: app

    required property var product
    property string route: "/showcase/"
    property bool wide: true
    // What the page scrolls in, for the engine's code (CodeBlock's).
    property var scroller: null

    spacing: Theme.l

    // The reader's own Play or Pause; null until they press one, when
    // the motion they asked the browser or the site for decides.
    property var chosen: null
    readonly property bool wanted: chosen !== null ? chosen : !Theme.calm
    property bool onScreen: false
    // Set once the page this was written into is the reader's: the
    // recording is never part of the page the build writes.
    property bool awake: false

    function look() {
        if (!frame.visible || frame.height <= 0) {
            onScreen = false;
            return;
        }
        var at = frame.mapToItem(null, 0, 0);
        onScreen = at.y + frame.height > Running.viewTop && at.y < Running.viewBottom;
    }

    Connections {
        target: Running
        function onMoved() {
            app.look();
        }
    }
    Timer {
        interval: 0
        running: Nav.inBrowser()
        onTriggered: {
            app.awake = true;
            app.look();
        }
    }

    Column {
        width: parent.width
        spacing: Theme.xs

        Text {
            width: parent.width
            text: app.product.maker
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize
            font.weight: Font.DemiBold
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.captionLine
        }
        Text {
            width: parent.width
            text: app.product.name
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: app.wide ? Theme.headlineSize + 4 : Theme.headlineSize - 2
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: app.wide ? Theme.headlineLine + 4 : Theme.headlineLine - 4
            wrapMode: Text.Wrap
            readonly property int headingLevel: 2
            Accessible.role: Accessible.Heading
        }
        Text {
            width: Math.min(parent.width, Theme.measure)
            text: app.product.claim
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: Theme.subtitleSize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.subtitleLine
            wrapMode: Text.Wrap
        }
    }

    // The recording, its poster's shape from the first paint, with its
    // control under it: nothing is drawn over the app it shows.
    Rectangle {
        id: frame
        width: parent.width
        height: screen.height + bar.height
        radius: Theme.radiusLarge
        color: Theme.surface
        border.color: Theme.divider
        border.width: 1
        clip: true
        onYChanged: app.look()
        onHeightChanged: app.look()

        Item {
            id: screen
            x: 1
            y: 1
            width: parent.width - 2
            height: Math.round(width * app.product.recording.height / app.product.recording.width)

            Text {
                anchors.fill: parent
                textFormat: Text.RichText
                text: Media.pictureSet(app.route, "/showcase/media/" + app.product.recording.name + "-poster", parent.width, parent.height, app.product.recording.label, true)
            }
            Loader {
                id: player
                anchors.fill: parent
                // Made once the reader would see it play, and kept: a
                // recording the reader never sees play is never fetched.
                active: app.awake && ((app.wanted && app.onScreen && Running.shown) || status === Loader.Ready)
                source: Later.recording
                opacity: item && item.begun ? 1 : 0
                Behavior on opacity {
                    NumberAnimation {
                        duration: Theme.enterPanel
                        easing.type: Easing.OutCubic
                    }
                }
                onLoaded: {
                    item.source = Nav.at(Content.base, "/showcase/media/" + app.product.recording.name) + Media.recordingFormat();
                    item.wanted = Qt.binding(() => app.wanted && app.onScreen && Running.shown);
                }
            }
        }

        Rectangle {
            id: bar
            y: screen.y + screen.height
            width: parent.width
            height: 48
            color: Theme.surfaceRaised
            border.color: Theme.divider
            border.width: 0

            Rectangle {
                width: parent.width
                height: 1
                color: Theme.divider
            }
            Row {
                anchors.left: parent.left
                anchors.leftMargin: Theme.m
                anchors.verticalCenter: parent.verticalCenter
                spacing: Theme.xs

                Rectangle {
                    anchors.verticalCenter: parent.verticalCenter
                    width: 8
                    height: 8
                    radius: 4
                    color: app.wanted && app.awake ? Theme.accent : Theme.textMuted
                    Behavior on color {
                        ColorAnimation {
                            duration: Theme.moveSmall
                        }
                    }
                }
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: t`Recorded running`
                    color: Theme.textMuted
                    font.family: Theme.sans
                    font.pixelSize: Theme.captionSize
                    lineHeightMode: Text.FixedHeight
                    lineHeight: Theme.captionLine
                }
            }
            StageButton {
                anchors.right: parent.right
                anchors.rightMargin: Theme.xs
                anchors.verticalCenter: parent.verticalCenter
                primary: !app.wanted
                text: app.wanted ? t`Pause` : t`Play`
                label: (app.wanted ? t`Pause the recording of ` : t`Play the recording of `) + app.product.what
                onPressed: app.chosen = !app.wanted
            }
        }
    }

    // What the app is, and where its source is.
    Grid {
        width: parent.width
        columns: app.wide ? 2 : 1
        columnSpacing: Theme.xxl
        rowSpacing: Theme.l

        readonly property int side: app.wide ? Math.round((width - columnSpacing) * 0.42) : width

        Column {
            width: app.wide ? parent.width - parent.columnSpacing - parent.side : parent.width
            spacing: Theme.s

            Repeater {
                model: app.product.body
                Text {
                    required property string modelData
                    width: parent.width
                    text: modelData
                    color: Theme.text
                    font.family: Theme.sans
                    font.pixelSize: Theme.bodySize + 1
                    lineHeightMode: Text.FixedHeight
                    lineHeight: Theme.bodyLine + 4
                    wrapMode: Text.Wrap
                }
            }
        }
        Column {
            width: parent.side
            spacing: Theme.m

            Text {
                width: parent.width
                text: app.product.note
                color: Theme.textMuted
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.captionLine
                wrapMode: Text.Wrap
            }
            Flow {
                width: parent.width
                spacing: Theme.s

                LinkButton {
                    primary: true
                    label: app.product.source.label
                    href: app.product.source.href
                }
                LinkButton {
                    label: app.product.repo.label
                    href: app.product.repo.href
                }
            }
        }
    }

    // The captures, side by side at one height on a desk, each as wide
    // as its own shape makes it, so none is cropped or letterboxed; one
    // under another at its own height on a phone.
    Item {
        id: captures
        width: parent.width
        height: app.wide ? row.height : column.height

        readonly property real gap: Theme.l
        readonly property real shapes: app.product.captures.reduce((sum, capture) => sum + capture.width / capture.height, 0)
        readonly property real rowHeight: Math.floor((width - gap * (app.product.captures.length - 1)) / shapes)

        Row {
            id: row
            visible: app.wide
            spacing: captures.gap

            Repeater {
                model: app.wide ? app.product.captures : []
                ShowcaseCapture {
                    required property var modelData
                    capture: modelData
                    route: app.route
                    width: Math.floor(captures.rowHeight * modelData.width / modelData.height)
                }
            }
        }
        Column {
            id: column
            visible: !app.wide
            width: parent.width
            spacing: Theme.xl

            Repeater {
                model: app.wide ? [] : app.product.captures
                ShowcaseCapture {
                    required property var modelData
                    capture: modelData
                    route: app.route
                    width: column.width
                }
            }
        }
    }

    // The engine the app is built on, where its entry names one.
    Repeater {
        model: app.product.engine ? [app.product.engine] : []
        ShowcaseEngine {
            required property var modelData
            width: app.width
            heading: modelData.heading
            line: modelData.line
            label: modelData.label
            href: modelData.href
            about: modelData.example.about
            path: modelData.example.path
            snippets: modelData.example.snippets
            capture: modelData.example.capture
            route: app.route
            wide: app.wide
            scroller: app.scroller
        }
    }
}
