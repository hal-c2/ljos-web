import QtQuick

// What a picture of a root is to show, each part where a test knows what
// is drawn: colours, text in a loaded font, an image, a canvas's drawing,
// a clipped child, opacity and a transform.
Rectangle {
    id: root
    width: 400; height: 300
    color: "#204060"
    readonly property bool loaded: boxes.status === FontLoader.Ready && flag.status === Image.Ready && painted

    property bool painted: false

    FontLoader { id: boxes; source: "../assets/boxes.ttf" }

    Rectangle { id: red; x: 10; y: 10; width: 60; height: 40; color: "#ff0000" }
    Rectangle { id: green; x: 80; y: 10; width: 60; height: 40; color: "#00c000"; radius: 8 }

    // Every glyph of the font is a box: its inside is the text's colour.
    Text {
        id: label
        x: 160; y: 10
        text: "AB"
        color: "#ffff00"
        font.family: boxes.name
        font.pixelSize: 32
    }

    Image { id: flag; x: 10; y: 70; width: 64; height: 64; source: "../assets/flag.png" }

    Canvas {
        id: canvas
        x: 90; y: 70; width: 60; height: 60
        onPaint: {
            const paper = getContext("2d");
            paper.fillStyle = "#ff00ff";
            paper.fillRect(10, 10, 40, 40);
            root.painted = true;
        }
    }

    // The child reaches past its parent, which clips it.
    Item {
        id: clipper
        x: 170; y: 70; width: 40; height: 40
        clip: true
        Rectangle { id: clipped; width: 80; height: 80; color: "#00ffff" }
    }

    // Half of white over the root's colour.
    Rectangle { id: faded; x: 230; y: 70; width: 40; height: 40; color: "white"; opacity: 0.5 }

    // A square turned a quarter of a right angle about its centre.
    Rectangle {
        id: turned
        x: 300; y: 70; width: 50; height: 50
        color: "#ff8000"
        rotation: 45
    }

    // Scrolled down by its first row: the second shows.
    Flickable {
        id: flick
        x: 10; y: 150; width: 100; height: 100
        contentHeight: 300; contentY: 100
        clip: true
        Column {
            Rectangle { width: 100; height: 100; color: "#800000" }
            Rectangle { width: 100; height: 100; color: "#000080" }
            Rectangle { width: 100; height: 100; color: "#008000" }
        }
    }

    // What a field holds is its value, not an attribute.
    TextInput {
        id: field
        x: 160; y: 150; width: 120; height: 30
        text: "CD"
        color: "#ffffff"
        font.family: boxes.name
        font.pixelSize: 32
    }

    Rectangle { id: corner; x: 380; y: 280; width: 20; height: 20; color: "#000000" }
}
