import QtQuick
import Ljos.Blocks
import Site
import Demos

// The demos page: complete Ljós apps running in the page, flagship
// first. Each demo stands in its named Slot as the slot's own
// delegate, so the prerendered page holds the demo as first made
// and hydration takes it over in place; what paints (a canvas, a
// GPU face) paints then, and the words under each demo say what a
// reader without wasm or WebGPU is looking at. Nothing on this
// page is needed to read it. The sections are written out, not
// repeated over a model: a Slot's delegate is made by the Slot,
// in the Slot's place, and a Repeater's model is not its to give.
Column {
    id: demos

    property int textWidth: width

    width: parent ? parent.width : 680
    spacing: 16

    Text {
        width: parent.width
        text: "Live demos"
        color: Theme.ink
        font.family: Theme.serif
        font.pixelSize: 34
        font.bold: true
        wrapMode: Text.Wrap
    }
    Text {
        width: parent.width
        text: "Each demo is a complete Ljós app that passes ljos check, compiled ahead of time and mounted in the page. The page reads with no script; where a demo cannot run — no wasm, no WebGPU — its picture and its words stand in its place."
        color: Theme.muted
        font.family: Theme.sans
        font.pixelSize: 15
        wrapMode: Text.Wrap
    }

    Column {
        width: demos.textWidth
        spacing: 8

        Text {
            width: parent.width
            text: "A shell you rewrite"
            color: Theme.ink
            font.family: Theme.serif
            font.pixelSize: 22
            font.bold: true
            wrapMode: Text.Wrap
        }
        Slot {
            name: "demo-shell"
            delegate: Component {
                PantryDemo {}
            }
        }
        Text {
            width: parent.width
            text: "The flagship: a small app whose shell you rewrite in the page's editor. Its data and state survive the swap; move a Slot and its contribution moves with it; break the shell and the app's own shell stands, with what broke shown."
            color: Theme.ink
            font.family: Theme.sans
            font.pixelSize: 14
            wrapMode: Text.Wrap
        }
    }

    Column {
        width: demos.textWidth
        spacing: 8

        Text {
            width: parent.width
            text: "3D you can orbit"
            color: Theme.ink
            font.family: Theme.serif
            font.pixelSize: 22
            font.bold: true
            wrapMode: Text.Wrap
        }
        Slot {
            name: "demo-orbit"
            delegate: Component {
                Orbit {
                    width: demos.textWidth
                    height: width * 420 / 720
                }
            }
        }
        Text {
            width: parent.width
            text: "A Quick3D scene on wgpu, in the browser: drag to orbit it. The same scene runs natively under the same engine."
            color: Theme.ink
            font.family: Theme.sans
            font.pixelSize: 14
            wrapMode: Text.Wrap
        }
    }

    Column {
        width: demos.textWidth
        spacing: 8

        Text {
            width: parent.width
            text: "A shader effect"
            color: Theme.ink
            font.family: Theme.serif
            font.pixelSize: 22
            font.bold: true
            wrapMode: Text.Wrap
        }
        Slot {
            name: "demo-shader"
            delegate: Component {
                Shader {
                    width: demos.textWidth
                    height: width * 420 / 720
                }
            }
        }
        Text {
            width: parent.width
            text: "A custom shader over live content, written as part of the app — no toolkit-private path, nothing pre-baked."
            color: Theme.ink
            font.family: Theme.sans
            font.pixelSize: 14
            wrapMode: Text.Wrap
        }
    }

    Column {
        width: demos.textWidth
        spacing: 8

        Text {
            width: parent.width
            text: "A whole app"
            color: Theme.ink
            font.family: Theme.serif
            font.pixelSize: 22
            font.bold: true
            wrapMode: Text.Wrap
        }
        Slot {
            name: "demo-app"
            delegate: Component {
                FieldGuide {
                    width: demos.textWidth
                    height: width * 420 / 720
                }
            }
        }
        Text {
            width: parent.width
            text: "A real app of the corpus, not a toy: the whole program, running here as it runs on a desktop."
            color: Theme.ink
            font.family: Theme.sans
            font.pixelSize: 14
            wrapMode: Text.Wrap
        }
    }

    Column {
        width: demos.textWidth
        spacing: 8

        Text {
            width: parent.width
            text: "Motion"
            color: Theme.ink
            font.family: Theme.serif
            font.pixelSize: 22
            font.bold: true
            wrapMode: Text.Wrap
        }
        Slot {
            name: "demo-motion"
            delegate: Component {
                Motion {
                    width: demos.textWidth
                    height: width * 420 / 720
                }
            }
        }
        Text {
            width: parent.width
            text: "Animation as a property of the interface: one value, eased, driving everything that moves — and nothing at all moving, or costing, at rest."
            color: Theme.ink
            font.family: Theme.sans
            font.pixelSize: 14
            wrapMode: Text.Wrap
        }
    }
}
