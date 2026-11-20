import QtQuick
import Site
import Ljos.Core
import Ljos.Controls as C
import "../shells.js" as Shells

// A shell's own QML, the very file the site ships (Shells/), to read and
// to change: Apply compiles the edit in the page and shows the site in
// it, the page and the reader's place on it kept; a shell that does not
// work gives way to the marketing shell and says here what broke.
// The text comes with the first look (Shells/sources.json), so no page
// loads it for a reader who never asks.
C.Popup {
    id: panel

    // The shell whose QML this is ("marketing", "workbench", "desktop").
    property string name: "marketing"
    // Why the shell shown is not the one asked for, as ShellLoader says.
    property string error: ""
    property var source: null

    signal applied(string file, string text)
    signal reset

    function show(wanted) {
        panel.name = wanted;
        panel.open();
        Shells.sources().then((all) => {
            panel.source = all.shells[wanted] ?? null;
        }, (why) => {
            panel.source = null;
            console.warn(`ShellSource: ${why}`);
        });
    }

    modal: true
    focus: true
    // What it stands centred in, its top left where its parent's is: its
    // parent, or the page where it is loaded into a place of no size (a
    // place the page's size would stand over the page and take its
    // presses while the panel is shut).
    property Item room: parent
    width: room ? Math.min(room.width - 2 * Theme.m, 860) : 860
    height: room ? Math.min(room.height - 2 * Theme.xl, 720) : 720
    x: room ? Math.round((room.width - width) / 2) : 0
    y: room ? Math.round((room.height - height) / 2) : 0
    padding: Theme.m

    contentItem: Item {
        Accessible.role: Accessible.Dialog
        Accessible.name: heading.text

        Row {
            id: top
            width: parent.width
            spacing: Theme.xs

            Column {
                width: parent.width - shut.width - Theme.xs
                spacing: Theme.xxs

                Text {
                    id: heading
                    width: parent.width
                    text: panel.source ? panel.source.file : t`Shell`
                    color: Theme.text
                    font.family: Theme.mono
                    font.pixelSize: Theme.bodySize
                    font.weight: Font.DemiBold
                    elide: Text.ElideMiddle
                    Accessible.role: Accessible.Heading
                }
                Text {
                    width: parent.width
                    text: t`The QML of the shell you are looking at. Edit it and press Apply: the page and your place on it stay.`
                    color: Theme.textMuted
                    font.family: Theme.sans
                    font.pixelSize: Theme.captionSize
                    wrapMode: Text.Wrap
                }
            }
            C.Button {
                id: shut
                subtle: true
                iconName: "x"
                display: C.Button.IconOnly
                text: t`Close`
                onClicked: panel.close()
            }
        }

        Rectangle {
            id: well
            y: top.height + Theme.s
            width: parent.width
            height: parent.height - y - foot.height - Theme.s
            radius: Theme.radiusSmall
            color: Theme.codeBg
            border.color: editor.activeFocus ? Theme.focusRing : Theme.border
            border.width: editor.activeFocus ? 2 : 1

            Flickable {
                anchors.fill: parent
                anchors.margins: 10
                contentWidth: editor.width
                contentHeight: editor.height
                clip: true

                CodeEditor {
                    id: editor
                    width: Math.max(parent.width, implicitWidth)
                    code: panel.source ? panel.source.text : ""
                    rich: panel.source ? panel.source.rich : ""
                    label: t`Edit this shell's QML`
                    errors: told
                    color: Theme.codeFg
                }
            }
        }

        Column {
            id: foot
            y: parent.height - height
            width: parent.width
            spacing: Theme.xs

            Text {
                id: told
                visible: panel.error !== ""
                width: parent.width
                text: panel.error
                color: Theme.danger
                font.family: Theme.mono
                font.pixelSize: 12
                wrapMode: Text.Wrap
            }
            Row {
                spacing: Theme.xs

                C.Button {
                    primary: true
                    iconName: "play"
                    text: t`Apply`
                    enabled: panel.source !== null
                    onClicked: panel.applied(panel.source.file, editor.text)
                }
                C.Button {
                    iconName: "refresh-cw"
                    text: t`Reset`
                    enabled: panel.source !== null
                    onClicked: {
                        editor.text = panel.source.text;
                        panel.reset();
                    }
                }
            }
        }
    }
}
