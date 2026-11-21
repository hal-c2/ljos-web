import QtQuick
import Site
import "../nav.js" as Nav

// A picture as big as the window holds, over everything the shell
// shows: the page's scroller would cut it to the page. It says what it
// is, links to the file itself (at its own size, to zoom or save), and
// closes on Close, Escape or a press beside it, giving the keyboard
// back to what opened it.
Rectangle {
    id: view

    property bool open: false
    property string source: ""
    property string name: ""
    property var opener: null

    function show(address, said, from) {
        view.source = address;
        view.name = said;
        view.opener = from;
        view.open = true;
        view.forceActiveFocus();
    }
    function close() {
        if (!view.open)
            return;
        view.open = false;
        if (view.opener)
            view.opener.forceActiveFocus();
    }

    color: Theme.scrim
    opacity: open ? 1 : 0
    visible: opacity > 0
    focus: open
    Behavior on opacity {
        NumberAnimation {
            duration: view.open ? Theme.enterPanel : Theme.exitSmall
            easing.type: Easing.OutCubic
        }
    }

    Accessible.role: Accessible.Dialog
    Accessible.name: name
    Keys.onEscapePressed: view.close()

    // A press beside the picture closes it; one on it does not.
    MouseArea {
        anchors.fill: parent
        Accessible.ignored: true
        onClicked: view.close()
    }

    readonly property int pad: width >= Theme.wideFrom ? Theme.xl : Theme.m

    Rectangle {
        id: panel
        anchors.fill: parent
        anchors.margins: view.pad
        radius: Theme.radiusLarge
        color: Theme.surface
        border.color: Theme.border
        border.width: 1
        // Grows into place where motion is wanted; only fades where it
        // is calmed.
        scale: view.open || Theme.calm ? 1 : 0.97
        Behavior on scale {
            NumberAnimation {
                duration: view.open ? Theme.enterPanel : Theme.exitSmall
                easing.type: Easing.OutCubic
            }
        }

        MouseArea {
            anchors.fill: parent
            Accessible.ignored: true
        }

        Item {
            id: bar
            x: Theme.m
            y: Theme.s
            width: parent.width - 2 * Theme.m
            height: Math.max(close.height, words.implicitHeight)

            Text {
                id: words
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - links.width - Theme.m
                text: view.name
                color: Theme.text
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
                font.weight: Font.DemiBold
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.captionLine
                wrapMode: Text.Wrap
                maximumLineCount: 2
                elide: Text.ElideRight
                Accessible.ignored: true
            }
            Row {
                id: links
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: Theme.m

                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    textFormat: Text.RichText
                    text: Nav.anchor(view.source, ShotsWords.openImage, true)
                    color: Theme.link
                    linkColor: Theme.link
                    font.family: Theme.sans
                    font.pixelSize: Theme.captionSize
                    onLinkActivated: (to) => Nav.go(to)
                }
                StageButton {
                    id: close
                    text: ShotsWords.close
                    onPressed: view.close()
                }
            }
        }

        Rectangle {
            x: Theme.m
            y: bar.y + bar.height + Theme.s
            width: parent.width - 2 * Theme.m
            height: parent.height - y - Theme.m
            radius: Theme.radius
            color: Theme.stage
            border.color: Theme.stageEdge
            border.width: 1
            clip: true

            Image {
                anchors.fill: parent
                anchors.margins: 1
                source: view.source
                fillMode: Image.PreserveAspectFit
                asynchronous: true
                opacity: status === Image.Ready ? 1 : 0
                Accessible.role: Accessible.Graphic
                Accessible.name: view.name
                Behavior on opacity {
                    NumberAnimation {
                        duration: Theme.enterSmall
                    }
                }
            }
        }
    }
}
