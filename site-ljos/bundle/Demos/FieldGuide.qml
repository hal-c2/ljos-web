// Ljos.Core before QtQuick so t`` is available while shared names stay QtQuick's.
import Ljos.Core
import QtQuick
import QtQuick.Controls
import "logic/fieldGuide.ts" as Guide

// A complete searchable field guide app: typed species data, search filtering,
// sightings, and notes live in logic/fieldGuide.ts while QML declares the view.
// Try adding a species to logic/fieldGuide.ts or tuning maxLengthCm and listWidth.
Rectangle {
    id: root
    width: 720
    height: 420
    color: look.canvas
    radius: 8

    // Remix knobs: adjust bar scales and list proportions in one line.
    property real maxLengthCm: 100
    property real maxWingspanCm: 200
    property int listWidth: 272
    property int rowHeight: 52

    // Host contract: DemoFrame pauses off-screen demos and sets calm for reduced motion.
    property bool active: true
    property bool calm: false

    // Reader state, keyed by Latin name so filtering never drops ticks or notes.
    property var seen: []
    property var notes: []
    readonly property int seenCount: seen.length
    readonly property int totalSpecies: Guide.species.length
    property int current: 0
    readonly property var bird: Guide.birdAt(current)

    // Filtered rows feeding the ListView; rebuilt whenever the search text changes.
    ListModel { id: shown }

    function refilter() {
        const matches = Guide.filterSpecies(search.text);
        shown.clear();
        for (const item of matches)
            shown.append({ "name": item.name, "latin": item.latin, "season": item.season, "at": item.index });
        if (matches.length > 0)
            root.current = matches[0].index;
    }

    Component.onCompleted: refilter()

    QtObject {
        id: look
        readonly property bool dark: Application.styleHints.colorScheme === Qt.ColorScheme.Dark
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
                width: 330
                height: 40
                verticalAlignment: Text.AlignVCenter
                color: look.ink
                font.pixelSize: 22
                font.bold: true
                text: t`Field guide`
            }
            TextField {
                id: search
                width: parent.width - 344
                palette.base: look.raised
                palette.text: look.ink
                palette.placeholderText: look.muted
                placeholderText: t`Search by name…`
                onTextChanged: root.refilter()
            }
        }

        Row {
            width: parent.width
            height: parent.height - 52
            spacing: 14

            ListView {
                id: list
                width: root.listWidth
                height: parent.height
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
                    color: root.current === at ? look.selected : look.raised
                    Column {
                        x: 12
                        y: 7
                        spacing: 1
                        Text {
                            color: look.ink
                            font.pixelSize: 15
                            text: Guide.isSeen(root.seen, latin) ? t`✓ ${name}` : name
                        }
                        Text {
                            color: look.muted
                            font.pixelSize: 12
                            font.italic: true
                            text: t`${latin} · ${season}`
                        }
                    }
                    MouseArea {
                        anchors.fill: parent
                        Accessible.name: name
                        Accessible.role: Accessible.Button
                        onClicked: root.current = at
                    }
                }
            }

            Column {
                width: parent.width - root.listWidth - 14
                spacing: 7
                Text {
                    width: parent.width
                    color: look.ink
                    font.pixelSize: 26
                    font.bold: true
                    elide: Text.ElideRight
                    text: root.bird.name
                }
                Text {
                    width: parent.width
                    color: look.muted
                    font.pixelSize: 14
                    font.italic: true
                    text: t`${root.bird.latin} · ${root.bird.season.toLowerCase()}`
                }
                Row {
                    spacing: 10
                    Text {
                        width: 86
                        color: look.muted
                        font.pixelSize: 13
                        text: t`Length`
                    }
                    Rectangle {
                        width: 170
                        height: 10
                        radius: 5
                        color: look.track
                        Rectangle {
                            width: parent.width * Guide.barRatio(root.bird.lengthCm, root.maxLengthCm)
                            height: parent.height
                            radius: 5
                            color: look.accent
                            Behavior on width {
                                enabled: root.active
                                NumberAnimation {
                                    duration: root.calm ? 200 : 280
                                    easing.type: Easing.OutCubic
                                }
                            }
                        }
                    }
                    Text {
                        color: look.inkSoft
                        font.pixelSize: 13
                        text: t`${root.bird.lengthCm} cm`
                    }
                }
                Row {
                    spacing: 10
                    Text {
                        width: 86
                        color: look.muted
                        font.pixelSize: 13
                        text: t`Wingspan`
                    }
                    Rectangle {
                        width: 170
                        height: 10
                        radius: 5
                        color: look.track
                        Rectangle {
                            width: parent.width * Guide.barRatio(root.bird.wingspanCm, root.maxWingspanCm)
                            height: parent.height
                            radius: 5
                            color: look.growth
                            Behavior on width {
                                enabled: root.active
                                NumberAnimation {
                                    duration: root.calm ? 200 : 280
                                    easing.type: Easing.OutCubic
                                }
                            }
                        }
                    }
                    Text {
                        color: look.inkSoft
                        font.pixelSize: 13
                        text: t`${root.bird.wingspanCm} cm`
                    }
                }
                Text {
                    width: parent.width
                    wrapMode: Text.WordWrap
                    color: look.inkSoft
                    font.pixelSize: 14
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
                    font.pixelSize: 14
                    text: t`Seen ${root.seenCount} of ${root.totalSpecies}`
                }
            }
        }
    }
}
