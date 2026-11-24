import Ljos.Ui
import Site
import Ljos.Core
import Ljos.Layout
import Ljos.Controls as C
import "../shells.js" as Shells
import "logic/shells.ts" as Sources

// A shell's own QML, the very file the site ships (Shells/), to read and
// to change: Apply compiles the edit in the page and shows the site in
// it, the page and the reader's place on it kept; a shell that does not
// work gives way to the Elegant shell and says here what broke.
// The text comes with the first look (shell-sources.json), so no page
// loads it for a reader who never asks.
C.Popup {
    id: panel

    // The shell whose QML this is ("elegant", "workbench", "desktop").
    property string name: "elegant"
    // Why the shell shown is not the one asked for, as ShellLoader says.
    property string error: ""
    // Its source; `Sources.none` (no file) until it comes.
    property Sources.Source source: Sources.none
    readonly property bool has: source.file !== ""
    // What the reader has written in each shell's QML and not reset, by
    // its file: the editor holds one shell's at a time.
    property Sources.Drafts drafts: ({})

    signal applied(string file, string text)
    signal reset

    function show(wanted: string): void {
        if (panel.has)
            panel.drafts[panel.source.file] = editor.text;
        panel.name = wanted;
        panel.open();
        Shells.sources(Built.base).then((all: unknown) => {
            // Asked for another meanwhile: that one's comes.
            if (panel.name !== wanted)
                return;
            const source = Sources.sourceOf(all, wanted);
            panel.source = source;
            // The editor's text is written once the reader edits, and
            // the next shell's `code` would not show over it: it is that
            // shell's own, as last left.
            editor.text = source.file !== "" ? panel.drafts[source.file] ?? source.text : "";
        }, (why: unknown) => {
            panel.source = Sources.none;
            console.warn(`ShellSource: ${Sources.whyOf(why)}`);
        });
    }

    modal: true
    focus: true
    // What it stands centred in, its top left where its parent's is: its
    // parent, or the page where it is loaded into a place of no size (a
    // place the page's size would stand over the page and take its
    // presses while the panel is shut).
    property unknown room: parent
    width: Sources.isBox(room) ? Math.min(room.width - 2 * Theme.m, 860) : 860
    height: Sources.isBox(room) ? Math.min(room.height - 2 * Theme.xl, 720) : 720
    x: Sources.isBox(room) ? Math.round((room.width - width) / 2) : 0
    y: Sources.isBox(room) ? Math.round((room.height - height) / 2) : 0
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
                    text: panel.has ? t`Source of ${panel.source.file}` : t`Shell`
                    color: Theme.text
                    font.family: Theme.mono
                    font.size: Theme.bodySize
                    font.weight: Font.DemiBold
                    elide: Text.ElideMiddle
                    Accessible.role: Accessible.Heading
                }
                Text {
                    width: parent.width
                    text: t`The QML of the shell you are looking at. Edit it and press Apply: the page and your place on it stay.`
                    color: Theme.textMuted
                    font.family: Theme.sans
                    font.size: Theme.captionSize
                    wrap: Text.Wrap
                }
            }
            C.Button {
                id: shut
                subtle: true
                iconName: "x"
                display: C.Button.IconOnly
                text: t`Close shell source`
                onClicked: panel.close()
            }
        }

        Rectangle {
            id: well
            y: top.height + Theme.s
            width: parent.width
            height: parent.height - y - foot.height - Theme.s
            radius: Theme.radiusSmall
            fill: Theme.codeBg
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
                    code: panel.source.text
                    rich: panel.source.rich
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
                font.size: 12
                wrap: Text.Wrap
            }
            Row {
                spacing: Theme.xs

                C.Button {
                    primary: true
                    iconName: "play"
                    font.family: Theme.sans
                    text: t`Apply`
                    enabled: panel.has
                    onClicked: panel.applied(panel.source.file, editor.text)
                }
                C.Button {
                    iconName: "refresh-cw"
                    font.family: Theme.sans
                    text: t`Reset`
                    enabled: panel.has
                    onClicked: {
                        editor.text = panel.source.text;
                        panel.reset();
                    }
                }
            }
        }
    }
}
