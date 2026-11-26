import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Ljos.Controls
import "logic/fieldGuide.ts" as Guide

// A complete searchable field guide app: typed species data, search filtering,
// sightings, and notes live in logic/fieldGuide.ts while QML declares the view.
// Try adding a species to logic/fieldGuide.ts or tuning maxLengthCm and listWidth.
Rectangle {
    id: root
    width: 720
    height: 420
    fill: look.canvas
    radius: 8

    // Remix knobs: adjust bar scales and list proportions in one line.
    property real maxLengthCm: 100
    property real maxWingspanCm: 200
    property int listWidth: 272
    property int rowHeight: 52
    // Narrower than this, the list stands over the detail, not beside it.
    property int stackBelow: 600

    readonly property bool narrow: width < stackBelow

    // Host contract: DemoFrame pauses off-screen demos and sets calm for reduced motion.
    property bool active: true
    property bool calm: false

    // Reader state, keyed by Latin name so filtering never drops ticks or notes.
    property list<string> seen
    property list<Guide.NoteEntry> notes
    readonly property int seenCount: seen.length
    readonly property int totalSpecies: Guide.species.length
    property int current: 0
    readonly property Guide.Bird bird: Guide.birdAt(current)

    // Filtered rows feeding the ListView; rebuilt whenever the search text changes.
    ListModel { id: shown }

    function refilter(): void {
        const matches = Guide.filterSpecies(search.text);
        shown.clear();
        for (const item of matches)
            shown.append({ "name": item.name, "latin": item.latin, "season": item.season, "at": item.index });
        const first = matches[0];
        if (first !== undefined)
            root.current = first.index;
    }

    Component.onCompleted: refilter()

    Object {
        id: look
        readonly property bool dark: App.hints.colorScheme === ColorScheme.Dark
        readonly property color canvas: dark ? "#171b26" : "#f6f4ee"
        readonly property color raised: dark ? "#202636" : "#ffffff"
        readonly property color selected: dark ? "#2e3a55" : "#d6e0f2"
        readonly property color track: dark ? "#39415a" : "#cfd4de"
        readonly property color accent: dark ? "#e8a33d" : "#c07a12"
        // Accent text is darkened on light backgrounds so it keeps readable contrast.
        readonly property color accentText: dark ? "#e8a33d" : "#8f5a00"
        readonly property color growth: dark ? "#7ba05b" : "#4f7a2e"
        readonly property color ink: dark ? "#f0ead8" : "#1b1f2a"
        readonly property color inkSoft: dark ? "#d8dfed" : "#1b1f2a"
        readonly property color muted: dark ? "#a8b3c9" : "#4d5566"
    }

    Column {
        anchors.fill: parent
        anchors.margins: 16
        spacing: 12

        Row {
            width: parent.width
            spacing: 14
            Text {
                id: heading
                // Narrow, the heading takes only its words and leaves the rest to search.
                width: root.narrow ? implicitWidth : 330
                height: 40
                verticalAlignment: Text.AlignVCenter
                color: look.ink
                font.size: 22
                font.weight: Font.Bold
                elide: Text.ElideRight
                text: t`Field guide`
            }
            TextField {
                id: search
                width: parent.width - heading.width - 14
                palette.base: look.raised
                palette.text: look.ink
                palette.placeholderText: look.muted
                placeholderText: t`Search by name…`
                onTextChanged: root.refilter()
            }
        }

        // Wide, the list beside the detail; narrow, two rows and a half
        // of the list (so it reads as one that scrolls) over the detail.
        Item {
            id: body
            width: parent.width
            height: parent.height - 52

            ListView {
                id: list
                width: root.narrow ? body.width : root.listWidth
                // Beside the detail, it changes sides with it on a right-to-left page.
                x: App.layoutDirection === Direction.RightToLeft ? parent.width - width : 0
                height: root.narrow ? Math.round(root.rowHeight * 2.5 + spacing * 2) : body.height
                clip: true
                spacing: 6
                model: shown
                delegate: Rectangle {
                    required property string name
                    required property string latin
                    required property string season
                    required property int at
                    width: list.width
                    height: root.rowHeight
                    radius: 8
                    fill: root.current === at ? look.selected : look.raised
                    Column {
                        // Where it starts, read from the left; a right-to-left page
                        // sets it as far from the right (LayoutMirroring).
                        readonly property real startX: 12
                        x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
                        y: 7
                        spacing: 1
                        Text {
                            color: look.ink
                            font.size: 15
                            text: Guide.isSeen(root.seen, latin) ? t`✓ ${name}` : name
                        }
                        Text {
                            color: look.muted
                            font.size: 12
                            font.italic: true
                            text: t`${latin} · ${season}`
                        }
                    }
                    PointerArea {
                        anchors.fill: parent
                        Accessible.name: name
                        Accessible.role: Accessible.Button
                        onClicked: root.current = at
                    }
                }
            }

            // The detail scrolls where the frame leaves it less height
            // than it needs, and holds still where it fits.
            Flickable {
                id: detail
                // Where it starts, read from the left; a right-to-left page
                // sets it as far from the right (LayoutMirroring).
                readonly property real startX: root.narrow ? 0 : root.listWidth + 14
                x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
                y: root.narrow ? list.height + 12 : 0
                width: root.narrow ? body.width : body.width - root.listWidth - 14
                height: body.height - y
                contentWidth: width
                contentHeight: facts.height
                interactive: contentHeight > height
                boundsBehavior: Flickable.StopAtBounds
                clip: true

                Column {
                    id: facts
                    width: detail.width
                    spacing: 7
                    // A bar leaves room for its label and a value as wide as "200 cm".
                    readonly property real barWidth: Math.max(48, Math.min(170, width - 86 - 20 - 52))
                    Text {
                        width: parent.width
                        color: look.ink
                        font.size: 26
                        font.weight: Font.Bold
                        elide: Text.ElideRight
                        text: root.bird.name
                    }
                    Text {
                        width: parent.width
                        color: look.muted
                        font.size: 14
                        font.italic: true
                        elide: Text.ElideRight
                        text: t`${root.bird.latin} · ${root.bird.season.toLowerCase()}`
                    }
                    Row {
                        spacing: 10
                        Text {
                            width: 86
                            color: look.muted
                            font.size: 13
                            elide: Text.ElideRight
                            text: t`Length`
                        }
                        Rectangle {
                            width: facts.barWidth
                            height: 10
                            radius: 5
                            fill: look.track
                            Rectangle {
                                width: parent.width * Guide.barRatio(root.bird.lengthCm, root.maxLengthCm)
                                height: parent.height
                                radius: 5
                                fill: look.accent
                            }
                        }
                        Text {
                            color: look.inkSoft
                            font.size: 13
                            text: t`${root.bird.lengthCm} cm`
                        }
                    }
                    Row {
                        spacing: 10
                        Text {
                            width: 86
                            color: look.muted
                            font.size: 13
                            elide: Text.ElideRight
                            text: t`Wingspan`
                        }
                        Rectangle {
                            width: facts.barWidth
                            height: 10
                            radius: 5
                            fill: look.track
                            Rectangle {
                                width: parent.width * Guide.barRatio(root.bird.wingspanCm, root.maxWingspanCm)
                                height: parent.height
                                radius: 5
                                fill: look.growth
                            }
                        }
                        Text {
                            color: look.inkSoft
                            font.size: 13
                            text: t`${root.bird.wingspanCm} cm`
                        }
                    }
                    Text {
                        width: parent.width
                        wrap: Text.WordWrap
                        color: look.inkSoft
                        font.size: 14
                        text: root.bird.blurb
                    }
                    CheckBox {
                        id: seenBox
                        palette.text: look.inkSoft
                        palette.buttonText: look.inkSoft
                        palette.windowText: look.inkSoft
                        palette.base: look.raised
                        text: t`I have seen this one`
                        checked: Guide.isSeen(root.seen, root.bird.latin)
                        onToggled: root.seen = Guide.setSeen(root.seen, root.bird.latin, checked)
                    }
                    TextArea {
                        width: parent.width
                        height: 52
                        palette.base: look.raised
                        palette.text: look.ink
                        palette.placeholderText: look.muted
                        placeholderText: t`Your notes on this species…`
                        text: Guide.noteFor(root.notes, root.bird.latin)
                        // Guard against writing back unchanged text when switching species.
                        onTextChanged: if (text !== Guide.noteFor(root.notes, root.bird.latin)) root.notes = Guide.setNote(root.notes, root.bird.latin, text)
                    }
                    Text {
                        width: parent.width
                        color: look.accentText
                        font.size: 14
                        elide: Text.ElideRight
                        text: t`Seen ${root.seenCount} of ${root.totalSpecies}`
                    }
                }
            }
        }
    }
}
