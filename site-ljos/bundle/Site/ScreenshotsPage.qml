import QtQuick
import Site
import "shots.ts" as Shots
import "../nav.js" as Nav

// /screenshots/: what this deploy drew of every demo and shell, each
// picture beside the one the deploy before drew. The pictures and what
// is known of them are in the manifest the deploy's capture writes
// beside the page (site-ljos/shots/), read once the page runs: the
// site is built before its pictures are taken, so the page as written
// names only where the list is.
Column {
    id: screenshots

    property var scroller: null
    property bool wide: true
    // The shell's full-size view (Site/PictureView.qml).
    property var viewer: null

    property var manifest: null
    property bool loaded: false
    property var filter: Shots.everything

    readonly property var totals: manifest ? Shots.counts(manifest.shots) : ({ all: 0, changed: 0, broken: 0 })
    readonly property int notOnGpu: manifest ? Shots.notOnGpu(manifest.shots) : 0
    readonly property var shown: manifest ? Shots.groups(manifest.shots, filter) : []
    readonly property bool any: manifest !== null && manifest.shots.length > 0

    width: parent ? parent.width : 680
    spacing: Theme.xl
    topPadding: wide ? Theme.xl : Theme.m

    Component.onCompleted: {
        if (!Nav.inBrowser())
            return;
        Shots.load(Nav.at(Content.base, "/screenshots/manifest.json")).then((found) => {
            screenshots.manifest = found;
            screenshots.loaded = true;
        });
    }

    function show(status) {
        screenshots.filter = { status: status, kernel: "all", scheme: "all" };
    }

    Column {
        width: parent.width
        spacing: Theme.s

        Text {
            width: parent.width
            text: ShotsWords.title
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: screenshots.wide ? Theme.displaySize : Theme.compactDisplaySize
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: screenshots.wide ? Theme.displayLine : Theme.compactDisplayLine
            wrapMode: Text.Wrap
            readonly property int headingLevel: 1
            Accessible.role: Accessible.Heading
        }
        Text {
            width: Math.min(parent.width, Theme.measure)
            text: ShotsWords.lede
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.subtitleSize - 1
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.subtitleLine - 2
            wrapMode: Text.Wrap
        }
    }

    // Before the script runs: where the list is.
    Text {
        visible: !screenshots.loaded
        width: Math.min(parent.width, Theme.measure)
        textFormat: Text.RichText
        text: (Nav.inBrowser() ? ShotsWords.loading : Nav.escape(ShotsWords.withoutScript) + " " + Nav.anchor(Nav.at(Content.base, "/screenshots/manifest.json"), ShotsWords.manifestLink, true) + ".")
        color: Theme.textMuted
        linkColor: Theme.link
        font.family: Theme.sans
        font.pixelSize: Theme.bodySize
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.bodyLine
        wrapMode: Text.Wrap
        onLinkActivated: (to) => Nav.go(to)
    }

    // A deploy that drew nothing.
    Rectangle {
        visible: screenshots.loaded && !screenshots.any
        width: parent.width
        height: empty.implicitHeight + 2 * Theme.xl
        radius: Theme.radiusLarge
        color: Theme.surface
        border.color: Theme.border
        border.width: 1

        Column {
            id: empty
            x: Theme.xl
            y: Theme.xl
            width: parent.width - 2 * Theme.xl
            spacing: Theme.xs

            Text {
                width: parent.width
                text: ShotsWords.none
                color: Theme.text
                font.family: Theme.sans
                font.pixelSize: Theme.titleSize
                font.weight: Font.DemiBold
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.titleLine
                wrapMode: Text.Wrap
            }
            Text {
                width: Math.min(parent.width, Theme.measure)
                text: ShotsWords.noneWhy
                color: Theme.textMuted
                font.family: Theme.sans
                font.pixelSize: Theme.bodySize
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.bodyLine
                wrapMode: Text.Wrap
            }
        }
    }

    // Which deploy drew these, which it is held against, and how many
    // changed.
    Rectangle {
        id: deploy
        visible: screenshots.any
        width: parent.width
        height: about.implicitHeight + 2 * pad
        radius: Theme.radiusLarge
        color: Theme.surface
        border.color: Theme.border
        border.width: 1

        readonly property int pad: screenshots.wide ? Theme.l : Theme.m

        Column {
            id: about
            x: deploy.pad
            y: deploy.pad
            width: parent.width - 2 * deploy.pad
            spacing: Theme.l

            Flow {
                width: parent.width
                spacing: Theme.xl

                DeployLine {
                    heading: ShotsWords.thisDeploy
                    sha: screenshots.manifest ? screenshots.manifest.sha : ""
                    date: screenshots.manifest ? screenshots.manifest.date : ""
                    manifest: screenshots.manifest
                }
                DeployLine {
                    visible: screenshots.manifest !== null && screenshots.manifest.previous !== null
                    heading: ShotsWords.comparedWith
                    sha: visible ? screenshots.manifest.previous.sha : ""
                    date: visible ? screenshots.manifest.previous.date : ""
                    manifest: screenshots.manifest
                }
                Text {
                    visible: screenshots.manifest !== null && screenshots.manifest.previous === null
                    width: Math.min(about.width, 320)
                    text: ShotsWords.firstDeploy
                    color: Theme.textMuted
                    font.family: Theme.sans
                    font.pixelSize: Theme.bodySize
                    lineHeightMode: Text.FixedHeight
                    lineHeight: Theme.bodyLine
                    wrapMode: Text.Wrap
                }
            }

            Rectangle {
                width: parent.width
                height: 1
                color: Theme.divider
            }

            Flow {
                width: parent.width
                spacing: screenshots.wide ? Theme.xxl : Theme.xl

                Repeater {
                    model: [
                        { count: screenshots.totals.all, words: ShotsWords.pictures, tone: "" },
                        { count: screenshots.totals.changed, words: ShotsWords.changed, tone: "changed" },
                        { count: screenshots.totals.broken, words: ShotsWords.broken, tone: "broken" }
                    ]
                    delegate: Column {
                        required property var modelData
                        spacing: Theme.xxs
                        Accessible.role: Accessible.Grouping
                        Accessible.name: modelData.count + " " + modelData.words

                        Text {
                            text: String(parent.modelData.count)
                            color: parent.modelData.count > 0 && parent.modelData.tone === "broken" ? Theme.danger : Theme.text
                            font.family: Theme.sans
                            font.pixelSize: Theme.headlineSize
                            font.weight: Font.DemiBold
                            lineHeightMode: Text.FixedHeight
                            lineHeight: Theme.headlineLine
                            Accessible.ignored: true
                        }
                        Text {
                            text: parent.modelData.words
                            color: Theme.textMuted
                            font.family: Theme.sans
                            font.pixelSize: Theme.captionSize
                            lineHeightMode: Text.FixedHeight
                            lineHeight: Theme.captionLine
                            Accessible.ignored: true
                        }
                    }
                }
            }

            Text {
                width: Math.min(parent.width, Theme.measure)
                text: screenshots.manifest ? ShotsWords.threshold(Shots.share(screenshots.manifest.threshold)) : ""
                color: Theme.textMuted
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.captionLine
                wrapMode: Text.Wrap
            }
            Text {
                visible: screenshots.notOnGpu > 0
                width: Math.min(parent.width, Theme.measure)
                text: visible ? ShotsWords.notOnGpu(screenshots.notOnGpu, screenshots.totals.all) : ""
                color: Theme.text
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
                font.weight: Font.DemiBold
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.captionLine
                wrapMode: Text.Wrap
            }
            Text {
                visible: screenshots.manifest !== null && screenshots.manifest.gone.length > 0
                width: Math.min(parent.width, Theme.measure)
                text: visible ? ShotsWords.gone(screenshots.manifest.gone.length) : ""
                color: Theme.textMuted
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.captionLine
                wrapMode: Text.Wrap
            }
            // A picture taken off has no tile to say why on.
            Repeater {
                model: screenshots.manifest !== null && screenshots.manifest.removed ? screenshots.manifest.removed : []
                delegate: Column {
                    id: removal
                    required property var modelData
                    width: Math.min(parent.width, Theme.measure)

                    Text {
                        width: parent.width
                        text: ShotsWords.intended(removal.modelData.reason)
                        color: Theme.text
                        font.family: Theme.sans
                        font.pixelSize: Theme.captionSize
                        lineHeightMode: Text.FixedHeight
                        lineHeight: Theme.captionLine
                        wrapMode: Text.Wrap
                    }
                    Text {
                        visible: removal.modelData.pr !== null
                        textFormat: Text.RichText
                        text: visible ? Nav.anchor(Shots.pullAddress(screenshots.manifest, removal.modelData.pr), "#" + removal.modelData.pr, true) : ""
                        color: Theme.link
                        linkColor: Theme.link
                        font.family: Theme.sans
                        font.pixelSize: Theme.captionSize
                        lineHeightMode: Text.FixedHeight
                        lineHeight: Theme.captionLine
                        onLinkActivated: (to) => Nav.go(to)
                    }
                }
            }
        }
    }

    // What to show: everything, or only what changed or broke.
    Row {
        visible: screenshots.any
        spacing: Theme.xs

        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: ShotsWords.show
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize
            rightPadding: Theme.xxs
        }
        Repeater {
            model: [
                { status: "all", words: ShotsWords.all },
                { status: "changed", words: ShotsWords.onlyChanged },
                { status: "broken", words: ShotsWords.onlyBroken }
            ]
            delegate: StageButton {
                required property var modelData
                text: modelData.words
                checkable: true
                checked: screenshots.filter.status === modelData.status
                onPressed: screenshots.show(modelData.status)
            }
        }
    }

    Text {
        visible: screenshots.any && screenshots.shown.length === 0
        width: parent.width
        text: screenshots.filter.status === "broken" ? ShotsWords.nothingBroken : ShotsWords.nothingChanged
        color: Theme.textMuted
        font.family: Theme.sans
        font.pixelSize: Theme.bodySize
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.bodyLine
        wrapMode: Text.Wrap
    }

    // One section per demo or shell, its pictures in two columns where
    // there is room.
    Repeater {
        model: screenshots.shown
        delegate: Column {
            id: group
            required property var modelData
            width: screenshots.width
            spacing: Theme.m

            readonly property int columns: screenshots.wide ? 2 : 1
            readonly property int tileWidth: Math.floor((width - (columns - 1) * Theme.l) / columns)

            Column {
                width: parent.width
                spacing: Theme.xxs

                Text {
                    width: parent.width
                    text: group.modelData.title
                    color: Theme.text
                    font.family: Theme.sans
                    font.pixelSize: Theme.titleSize
                    font.weight: Font.DemiBold
                    lineHeightMode: Text.FixedHeight
                    lineHeight: Theme.titleLine
                    wrapMode: Text.Wrap
                    readonly property int headingLevel: 2
                    Accessible.role: Accessible.Heading
                }
                Text {
                    width: parent.width
                    textFormat: Text.RichText
                    text: Nav.anchor(Nav.at(Content.base, group.modelData.route), group.modelData.route, false)
                    color: Theme.textMuted
                    linkColor: Theme.link
                    font.family: Theme.mono
                    font.pixelSize: Theme.captionSize
                    lineHeightMode: Text.FixedHeight
                    lineHeight: Theme.captionLine
                    elide: Text.ElideRight
                    onLinkActivated: (to) => Nav.go(to)
                }
            }
            Flow {
                width: parent.width
                spacing: Theme.l

                Repeater {
                    model: group.modelData.shots
                    delegate: ShotTile {
                        required property var modelData
                        width: group.tileWidth
                        shot: modelData
                        manifest: screenshots.manifest
                        viewer: screenshots.viewer
                    }
                }
            }
        }
    }

    // One deploy: its commit, a link, and when it was.
    component DeployLine: Column {
        property string heading: ""
        property string sha: ""
        property string date: ""
        property var manifest: null
        spacing: Theme.xxs

        Text {
            text: parent.heading
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.captionLine
        }
        Text {
            textFormat: Text.RichText
            text: parent.manifest && parent.sha ? Nav.anchor(Shots.commitAddress(parent.manifest, parent.sha), Shots.short(parent.sha), false) : ""
            color: Theme.link
            linkColor: Theme.link
            font.family: Theme.mono
            font.pixelSize: Theme.bodySize
            font.weight: Font.DemiBold
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.bodyLine
            onLinkActivated: (to) => Nav.go(to)
        }
        Text {
            text: parent.date ? Shots.when(parent.date) : ""
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.captionLine
        }
    }
}
