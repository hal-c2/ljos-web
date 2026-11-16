import QtQuick
import QtQuick.Controls

// A small but whole application: a searchable field guide with a
// species list, a detail pane, sightings you tick off and notes you
// keep per species. The same file is the desktop app (`ljos run
// FieldGuide.qml`) and this page's live demo; nothing in it knows
// about the browser.
Rectangle {
    id: root
    width: 720
    height: 420
    color: look.canvas
    radius: 8

    property bool active: true
    property bool calm: false

    // The colours this app draws with, for the scheme the reader chose:
    // each the dark it was drawn in or a light that keeps the text on it
    // as readable.
    QtObject {
        id: look
        readonly property bool dark: Application.styleHints.colorScheme === Qt.ColorScheme.Dark
        readonly property color accent: dark ? "#e8a33d" : "#c07a12"
        // Words in the accent: on the light canvas it is darker than a fill
        // in it, or they would be too faint to read.
        readonly property color accentText: dark ? "#e8a33d" : "#8f5a00"
        readonly property color canvas: dark ? "#171b26" : "#f6f4ee"
        readonly property color growth: dark ? "#7ba05b" : "#4f7a2e"
        readonly property color ink1: dark ? "#f0ead8" : "#1b1f2a"
        readonly property color ink2: dark ? "#e8eaf0" : "#1b1f2a"
        readonly property color ink3: dark ? "#eef0f6" : "#1b1f2a"
        readonly property color ink4: dark ? "#f5efdd" : "#1b1f2a"
        readonly property color ink5: dark ? "#dfe4ef" : "#1b1f2a"
        readonly property color ink6: dark ? "#ccd3e2" : "#1b1f2a"
        readonly property color muted1: dark ? "#8b95af" : "#4d5566"
        readonly property color muted2: dark ? "#93a0ba" : "#4d5566"
        readonly property color muted3: dark ? "#a8b3c9" : "#4d5566"
        readonly property color raised: dark ? "#202636" : "#ffffff"
        readonly property color selected: dark ? "#2e3a55" : "#d6e0f2"
        readonly property color track: dark ? "#39415a" : "#cfd4de"
    }

    // The facts, as the model every view reads.
    ListModel {
        id: guide
        ListElement { name: "Atlantic puffin"; latin: "Fratercula arctica"; lengthCm: 30; wingspanCm: 53; season: "Breeding"; blurb: "Burrow-nester on grassy clifftops. The bright bill is a breeding-season dress; in winter it comes off." }
        ListElement { name: "Northern gannet"; latin: "Morus bassanus"; lengthCm: 94; wingspanCm: 172; season: "Breeding"; blurb: "Plunge-dives from 30 metres, folding back its wings at the last moment. Colonies are cities: tens of thousands of nests." }
        ListElement { name: "Common eider"; latin: "Somateria mollissima"; lengthCm: 65; wingspanCm: 95; season: "Year-round"; blurb: "A sea duck lined with its own down. Females gather ducklings into creches guarded by several adults." }
        ListElement { name: "Arctic tern"; latin: "Sterna paradisaea"; lengthCm: 35; wingspanCm: 80; season: "Breeding"; blurb: "Flies from Arctic summer to Antarctic summer and back — two summers a year, some 70,000 km of flying." }
        ListElement { name: "European shag"; latin: "Gulosus aristotelis"; lengthCm: 73; wingspanCm: 100; season: "Year-round"; blurb: "A slender, green-sheened cormorant of rocky coasts. Swims low, then stands with wings held out to dry." }
        ListElement { name: "Black-legged kittiwake"; latin: "Rissa tridactyla"; lengthCm: 39; wingspanCm: 95; season: "Breeding"; blurb: "The cliff gull that calls its own name. Nests on ledges so narrow the chicks sit facing the rock." }
        ListElement { name: "Common guillemot"; latin: "Uria aalge"; lengthCm: 43; wingspanCm: 70; season: "Breeding"; blurb: "Packs shoulder to shoulder on sea-cliff ledges. Its single egg is pointed, so it rolls in a tight circle, not off." }
        ListElement { name: "Manx shearwater"; latin: "Puffinus puffinus"; lengthCm: 34; wingspanCm: 82; season: "Breeding"; blurb: "Glides stiff-winged over the swell by day; comes to its burrow only at night, calling weirdly in the dark." }
        ListElement { name: "Great skua"; latin: "Stercorarius skua"; lengthCm: 55; wingspanCm: 136; season: "Breeding"; blurb: "A pirate: harries other seabirds until they drop their catch, and defends its own moorland nest against anything." }
    }

    // What the list shows after the search: rebuilt from `guide`.
    ListModel { id: shown }

    // The visitor's own records, kept by latin name so filtering the
    // list never loses them.
    property var seen: ({})
    property var notes: ({})
    property int seenCount: 0
    property int current: 0

    function refilter() {
        const needle = search.text.trim().toLowerCase();
        shown.clear();
        for (let i = 0; i < guide.count; i++) {
            const bird = guide.get(i);
            if (needle === "" || bird.name.toLowerCase().includes(needle) || bird.latin.toLowerCase().includes(needle))
                shown.append({ "name": bird.name, "latin": bird.latin, "season": bird.season, "at": i });
        }
        if (shown.count > 0)
            root.current = shown.get(0).at;
    }
    function recount() {
        let n = 0;
        for (const key in seen)
            if (seen[key] === true)
                n++;
        seenCount = n;
    }
    Component.onCompleted: refilter()

    readonly property var bird: guide.get(current)

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
                color: look.ink1
                font.pixelSize: 22
                font.bold: true
                text: qsTr("Field guide")
            }
            TextField {
                id: search
                width: parent.width - 344
                palette.base: look.raised
                palette.text: look.ink2
                palette.placeholderText: look.muted1
                placeholderText: qsTr("Search by name…")
                onTextChanged: root.refilter()
            }
        }

        Row {
            width: parent.width
            height: parent.height - 52
            spacing: 14

            ListView {
                id: list
                width: 272
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
                    height: 52
                    radius: 8
                    color: root.current === at ? look.selected : look.raised
                    Column {
                        x: 12
                        y: 7
                        spacing: 1
                        Text {
                            color: look.ink3
                            font.pixelSize: 15
                            text: (root.seen[latin] === true ? "✓ " : "") + name
                        }
                        Text {
                            color: look.muted2
                            font.pixelSize: 12
                            font.italic: true
                            text: latin + " · " + season
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
                width: parent.width - 286
                spacing: 7
                Text {
                    width: parent.width
                    color: look.ink4
                    font.pixelSize: 26
                    font.bold: true
                    elide: Text.ElideRight
                    text: root.bird ? root.bird.name : ""
                }
                Text {
                    width: parent.width
                    color: look.muted3
                    font.pixelSize: 14
                    font.italic: true
                    text: root.bird ? root.bird.latin + " · " + root.bird.season.toLowerCase() : ""
                }
                Row {
                    spacing: 10
                    Text {
                        width: 86
                        color: look.muted2
                        font.pixelSize: 13
                        text: qsTr("Length")
                    }
                    Rectangle {
                        width: 170
                        height: 10
                        radius: 5
                        color: look.track
                        Rectangle {
                            width: parent.width * (root.bird ? root.bird.lengthCm / 100 : 0)
                            height: parent.height
                            radius: 5
                            color: look.accent
                        }
                    }
                    Text {
                        color: look.ink5
                        font.pixelSize: 13
                        text: root.bird ? root.bird.lengthCm + " cm" : ""
                    }
                }
                Row {
                    spacing: 10
                    Text {
                        width: 86
                        color: look.muted2
                        font.pixelSize: 13
                        text: qsTr("Wingspan")
                    }
                    Rectangle {
                        width: 170
                        height: 10
                        radius: 5
                        color: look.track
                        Rectangle {
                            width: parent.width * (root.bird ? root.bird.wingspanCm / 200 : 0)
                            height: parent.height
                            radius: 5
                            color: look.growth
                        }
                    }
                    Text {
                        color: look.ink5
                        font.pixelSize: 13
                        text: root.bird ? root.bird.wingspanCm + " cm" : ""
                    }
                }
                Text {
                    width: parent.width
                    wrapMode: Text.WordWrap
                    color: look.ink6
                    font.pixelSize: 14
                    text: root.bird ? root.bird.blurb : ""
                }
                CheckBox {
                    id: seenBox
                    palette.text: look.ink5
                    palette.buttonText: look.ink5
                    palette.windowText: look.ink5
                    palette.base: look.raised
                    text: qsTr("I have seen this one")
                    checked: root.bird ? root.seen[root.bird.latin] === true : false
                    onToggled: {
                        if (!root.bird)
                            return;
                        const next = Object.assign({}, root.seen);
                        next[root.bird.latin] = checked;
                        root.seen = next;
                        root.recount();
                    }
                }
                TextArea {
                    width: parent.width
                    height: 52
                    palette.base: look.raised
                    palette.text: look.ink2
                    palette.placeholderText: look.muted1
                    placeholderText: qsTr("Your notes on this species…")
                    text: root.bird ? (root.notes[root.bird.latin] ?? "") : ""
                    onTextChanged: {
                        if (!root.bird)
                            return;
                        const next = Object.assign({}, root.notes);
                        next[root.bird.latin] = text;
                        root.notes = next;
                    }
                }
                Text {
                    width: parent.width
                    color: look.accentText
                    font.pixelSize: 14
                    text: qsTr("Seen %1 of %2").arg(root.seenCount).arg(guide.count)
                }
            }
        }
    }
}
