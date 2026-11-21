import QtQuick
import Site
import "shots.ts" as Shots
import "../nav.js" as Nav

// One picture of /screenshots/: how it was taken, what became of it
// since the deploy before (in words, not colour alone), the picture
// before beside the one now, and the ways on: full size, the
// difference, and a bug report with all of it written in.
Rectangle {
    id: tile

    property var shot: null
    property var manifest: null
    property var viewer: null

    readonly property string status: shot ? shot.status : "same"
    // A picture is fetched only once it comes within a screen of the
    // band the reader sees, and kept once it has.
    property bool near: false

    height: inner.implicitHeight + 2 * Theme.m
    radius: Theme.radiusLarge
    color: Theme.surface
    border.color: status === "broken" ? Theme.danger : Theme.border
    border.width: 1

    Accessible.role: Accessible.Grouping
    Accessible.name: shot ? Shots.label(shot, ShotsWords.names, ShotsWords.schemes) : ""

    function look() {
        if (near || !Nav.inBrowser())
            return;
        const at = tile.mapToItem(null, 0, 0);
        const reach = Running.viewBottom - Running.viewTop;
        near = at.y + tile.height > Running.viewTop - reach && at.y < Running.viewBottom + reach;
    }
    Connections {
        target: Running
        function onMoved() {
            tile.look();
        }
    }
    Component.onCompleted: Qt.callLater(look)
    onYChanged: look()

    function beside(file) {
        return Nav.at(Content.base, Shots.beside("/", file));
    }
    // The picture now, or the one before, as big as the window holds;
    // the keyboard comes back to Full size when it closes.
    function open(earlier) {
        if (!viewer || !shot)
            return;
        const file = earlier && shot.before ? shot.before.file : shot.file;
        const said = earlier ? ShotsWords.before(manifest && manifest.previous ? Shots.short(manifest.previous.sha) : "") : ShotsWords.now;
        viewer.show(beside(file), ShotsWords.pictureOf(said, Shots.label(shot, ShotsWords.names, ShotsWords.schemes)), full);
    }

    readonly property string verdict: !shot ? "" : status === "same" ? ShotsWords.same : status === "new" ? ShotsWords.fresh : status === "changed" ? ShotsWords.changedBy(Shots.share(shot.diff ? shot.diff.ratio : 1)) : ShotsWords.brokenBy(shot.health.problems.join("; "))

    Column {
        id: inner
        x: Theme.m
        y: Theme.m
        width: tile.width - 2 * Theme.m
        spacing: Theme.s

        // How it was taken, and what became of it.
        Column {
            width: parent.width
            spacing: Theme.xxs

            Text {
                width: parent.width
                text: tile.shot ? Shots.renderer(tile.shot, ShotsWords.names) + " · " + ShotsWords.schemes[tile.shot.scheme] + " · " + Shots.size(tile.shot) : ""
                color: Theme.text
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
                font.weight: Font.DemiBold
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.captionLine
                wrapMode: Text.Wrap
                Accessible.ignored: true
            }
            Row {
                width: parent.width
                spacing: Theme.xs

                Rectangle {
                    y: Math.round((Theme.captionLine - height) / 2)
                    width: 8
                    height: 8
                    radius: 4
                    color: tile.status === "changed" ? Theme.accent : tile.status === "broken" ? Theme.danger : tile.status === "new" ? Theme.link : Theme.border
                    Accessible.ignored: true
                }
                Text {
                    width: parent.width - 8 - Theme.xs
                    text: tile.verdict
                    color: tile.status === "broken" ? Theme.danger : tile.status === "same" ? Theme.textMuted : Theme.text
                    font.family: Theme.sans
                    font.pixelSize: Theme.captionSize
                    lineHeightMode: Text.FixedHeight
                    lineHeight: Theme.captionLine
                    wrapMode: Text.Wrap
                }
            }
        }

        // The one before, then the one now: as a reader reads.
        Row {
            id: pair
            width: parent.width
            spacing: Theme.s

            readonly property int each: Math.floor((width - spacing) / 2)
            // A phone's picture is tall: it is shown whole, no taller
            // than a little more than it is wide.
            readonly property int tall: tile.shot ? Math.min(Math.round(each * tile.shot.height / tile.shot.width), Math.round(each * 1.25)) : 0

            Thumb {
                width: pair.each
                height: pair.tall
                caption: ShotsWords.before(tile.manifest && tile.manifest.previous ? Shots.short(tile.manifest.previous.sha) : "")
                address: tile.near && tile.shot && tile.shot.before ? tile.beside(tile.shot.before.thumb) : ""
                missing: tile.shot !== null && tile.shot.before === null
                onOpened: tile.open(true)
            }
            Thumb {
                width: pair.each
                height: pair.tall
                caption: ShotsWords.now
                address: tile.near && tile.shot ? tile.beside(tile.shot.thumb) : ""
                missing: false
                onOpened: tile.open(false)
            }
        }

        // A canvas that turns on its own is never caught on the same
        // frame twice: it was checked that it drew, and left out.
        Text {
            visible: tile.shot !== null && Shots.moves(tile.shot)
            width: parent.width
            text: ShotsWords.moving
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.captionLine
            wrapMode: Text.Wrap
        }

        // Why it changed, where a pull request said it would.
        Text {
            visible: tile.shot !== null && tile.shot.accepted !== null
            width: parent.width
            text: visible ? ShotsWords.intended(tile.shot.accepted.reason) : ""
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.captionLine
            wrapMode: Text.Wrap
        }
        Text {
            visible: tile.shot !== null && tile.shot.accepted !== null && tile.shot.accepted.pr !== null && tile.manifest !== null
            textFormat: Text.RichText
            text: visible ? Nav.anchor(Shots.pullAddress(tile.manifest, tile.shot.accepted.pr), "#" + tile.shot.accepted.pr, true) : ""
            color: Theme.link
            linkColor: Theme.link
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.captionLine
            onLinkActivated: (to) => Nav.go(to)
        }

        Flow {
            width: parent.width
            spacing: Theme.m

            StageButton {
                id: full
                text: ShotsWords.fullSize
                onPressed: tile.open(false)
            }
            Text {
                visible: tile.shot !== null && tile.shot.diff !== null && tile.shot.diff.file !== null
                height: full.height
                verticalAlignment: Text.AlignVCenter
                textFormat: Text.RichText
                text: visible ? Nav.anchor(tile.beside(tile.shot.diff.file), ShotsWords.difference, true) : ""
                color: Theme.link
                linkColor: Theme.link
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
                onLinkActivated: (to) => Nav.go(to)
            }
            Text {
                height: full.height
                verticalAlignment: Text.AlignVCenter
                textFormat: Text.RichText
                text: tile.shot && tile.manifest ? Nav.anchor(Shots.issueAddress(tile.manifest, tile.shot, (file) => globalThis.location.origin + tile.beside(file)), ShotsWords.report, true) : ""
                color: Theme.link
                linkColor: Theme.link
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
                onLinkActivated: (to) => Nav.go(to)
            }
        }
    }

    // A small picture on the stage's ground, its caption over it, that
    // fades in once it has loaded and opens full size when pressed.
    component Thumb: Column {
        id: thumb
        property string caption: ""
        property string address: ""
        property bool missing: false
        signal opened
        spacing: Theme.xxs

        Text {
            width: parent.width
            text: thumb.caption
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.captionLine
            elide: Text.ElideRight
            Accessible.ignored: true
        }
        Rectangle {
            width: parent.width
            height: thumb.height - Theme.captionLine - thumb.spacing
            radius: Theme.radius
            color: Theme.stage
            border.color: Theme.stageEdge
            border.width: 1
            clip: true

            Text {
                visible: thumb.missing
                anchors.centerIn: parent
                width: parent.width - 2 * Theme.s
                horizontalAlignment: Text.AlignHCenter
                text: ShotsWords.nothingBefore
                color: Theme.textMuted
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
                wrapMode: Text.Wrap
            }
            Image {
                id: picture
                visible: !thumb.missing
                anchors.fill: parent
                anchors.margins: 1
                source: thumb.address
                fillMode: Image.PreserveAspectFit
                asynchronous: true
                opacity: status === Image.Ready ? 1 : 0
                Accessible.role: Accessible.Graphic
                Accessible.name: thumb.caption
                Behavior on opacity {
                    NumberAnimation {
                        duration: Theme.enterSmall
                        easing.type: Easing.OutCubic
                    }
                }
            }
            MouseArea {
                visible: !thumb.missing
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                Accessible.ignored: true
                onClicked: thumb.opened()
            }
        }
    }
}
