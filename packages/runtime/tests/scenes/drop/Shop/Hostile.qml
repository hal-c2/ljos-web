import QtQuick
import QtQuick.Effects
import QtQuick.Shapes
import QtCharts

// A block that hands a string a shell gives it to one place a string becomes
// style or a request, named by `kind`: tests/live.spec.js goes through them.
Item {
    id: block
    objectName: "hostile"
    width: 100
    height: 100
    property string kind
    property string given
    readonly property var made: ({
        rectangle: rectangle, border: border, gradient: gradient, window: window, array: array, value: value,
        ink: ink, link: link, outline: outline, family: family, features: features, rich: rich, input: input,
        canvas: canvas, shape: shape, shapeGradient: shapeGradient, conical: conical, conicalAngle: conicalAngle,
        shadow: shadow, effect: effect, cursor: cursor, hover: hover, chart: chart, tiled: tiled, border_image: borderImage
    })
    Loader { anchors.fill: parent; sourceComponent: block.made[block.kind] ?? null }

    Component { id: rectangle; Rectangle { objectName: "sunk"; color: block.given } }
    Component { id: border; Rectangle { objectName: "sunk"; border.width: 4; border.color: block.given } }
    Component {
        id: gradient
        Rectangle {
            objectName: "sunk"
            gradient: Gradient {
                GradientStop { position: 0; color: block.given }
                GradientStop { position: 1; color: "blue" }
            }
        }
    }
    Component { id: window; Window { visible: true; width: 50; height: 50; color: block.given } }
    Component { id: array; Rectangle { objectName: "sunk"; color: [block.given] } }
    Component { id: value; Rectangle { objectName: "sunk"; property color held: block.given; color: held } }
    Component { id: ink; Text { text: "ink"; color: block.given } }
    Component { id: link; Text { textFormat: Text.RichText; text: "<a href='a'>link</a>"; linkColor: block.given } }
    Component { id: outline; Text { text: "outline"; style: Text.Outline; styleColor: block.given } }
    Component { id: family; Text { text: "family"; font.family: block.given } }
    Component { id: features; Text { text: "features"; font.features: ({ liga: block.given }) } }
    Component { id: rich; Text { textFormat: Text.RichText; text: block.given } }
    Component { id: input; TextInput { text: "input"; color: block.given; selectionColor: block.given; selectedTextColor: block.given } }
    Component {
        id: canvas
        Canvas {
            anchors.fill: parent
            onPaint: {
                const paper = getContext("2d")
                const ramp = paper.createLinearGradient(0, 0, 10, 10)
                try { ramp.addColorStop(0, block.given) } catch (error) {}
                paper.fillStyle = block.given
                paper.strokeStyle = block.given
                paper.shadowColor = block.given
                paper.filter = block.given
                paper.font = block.given
                paper.fillRect(0, 0, 10, 10)
                paper.strokeRect(0, 0, 10, 10)
                paper.fillText("x", 2, 2)
            }
        }
    }
    Component {
        id: shape
        Shape {
            ShapePath {
                fillColor: block.given
                strokeColor: block.given
                PathLine { x: 50; y: 0 }
                PathLine { x: 50; y: 50 }
            }
        }
    }
    Component {
        id: shapeGradient
        Shape {
            ShapePath {
                fillGradient: LinearGradient {
                    x2: 50
                    GradientStop { position: 0; color: block.given }
                }
                PathLine { x: 50; y: 0 }
                PathLine { x: 50; y: 50 }
            }
        }
    }
    Component {
        id: conical
        Shape {
            ShapePath {
                fillGradient: ConicalGradient {
                    GradientStop { position: 0; color: block.given }
                    GradientStop { position: 1; color: "blue" }
                }
                PathLine { x: 50; y: 0 }
                PathLine { x: 50; y: 50 }
            }
        }
    }
    // A number's place written with a string: what is around it closes the
    // gradient and opens another.
    Component {
        id: conicalAngle
        Shape {
            ShapePath {
                fillGradient: ConicalGradient {
                    angle: block.given
                    GradientStop { position: 0; color: "red" }
                    GradientStop { position: 1; color: "blue" }
                }
                PathLine { x: 50; y: 0 }
                PathLine { x: 50; y: 50 }
            }
        }
    }
    Component { id: shadow; RectangularShadow { anchors.fill: parent; color: block.given } }
    Component {
        id: effect
        Item {
            anchors.fill: parent
            Rectangle { id: painted; anchors.fill: parent; color: "red" }
            MultiEffect { source: painted; anchors.fill: parent; shadowEnabled: true; shadowColor: block.given; colorization: 1; colorizationColor: block.given }
        }
    }
    Component { id: cursor; MouseArea { anchors.fill: parent; cursorShape: block.given } }
    Component { id: hover; Item { anchors.fill: parent; HoverHandler { cursorShape: block.given } } }
    Component { id: chart; ChartView { anchors.fill: parent; backgroundColor: block.given; plotAreaColor: block.given } }
    Component { id: tiled; Image { anchors.fill: parent; fillMode: Image.Tile; source: block.given } }
    Component { id: borderImage; BorderImage { anchors.fill: parent; source: block.given } }
}
