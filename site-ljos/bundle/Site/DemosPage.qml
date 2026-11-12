import QtQuick
import Ljos.Blocks
import Site

// The demos page: complete Ljós apps running in the page, flagship
// first. Each demo mounts into its named Slot; until the showcase
// lands, the slot's own delegate says what stands there and what it
// shows, which is also what a reader without wasm or WebGPU keeps.
// Nothing on this page is needed to read it.
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

    Repeater {
        model: [
            {
                "slot": "demo-shell",
                "title": "A shell you rewrite",
                "words": "The flagship: a small app whose shell you rewrite in the page's editor. Its data and state survive the swap; move a Slot and its contribution moves with it; break the shell and the app's own shell stands, with what broke shown."
            },
            {
                "slot": "demo-orbit",
                "title": "3D you can orbit",
                "words": "A Quick3D scene on wgpu, in the browser: drag to orbit it. The same scene runs natively under the same engine."
            },
            {
                "slot": "demo-shader",
                "title": "A shader effect",
                "words": "A custom shader over live content, written as part of the app — no toolkit-private path, nothing pre-baked."
            },
            {
                "slot": "demo-app",
                "title": "A whole app",
                "words": "A real app of the corpus, not a toy: the whole program, running here as it runs on a desktop."
            },
            {
                "slot": "demo-motion",
                "title": "Motion",
                "words": "Animation as a property of the interface: one value, eased, driving everything that moves — and nothing at all moving, or costing, at rest."
            }
        ]

        Column {
            required property var modelData

            width: demos.textWidth
            spacing: 8

            Text {
                width: parent.width
                text: modelData.title
                color: Theme.ink
                font.family: Theme.serif
                font.pixelSize: 22
                font.bold: true
                wrapMode: Text.Wrap
            }
            Slot {
                name: modelData.slot
                delegate: Component {
                    Rectangle {
                        property string words: ""
                        width: demos.textWidth
                        height: 150
                        color: Theme.panel
                        border.color: Theme.border
                        border.width: 1

                        Text {
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.verticalCenter: parent.verticalCenter
                            anchors.margins: 16
                            horizontalAlignment: Text.AlignHCenter
                            text: "This demo mounts here."
                            color: Theme.muted
                            font.family: Theme.sans
                            font.pixelSize: 13
                            wrapMode: Text.Wrap
                        }
                    }
                }
            }
            Text {
                width: parent.width
                text: modelData.words
                color: Theme.ink
                font.family: Theme.sans
                font.pixelSize: 14
                wrapMode: Text.Wrap
            }
        }
    }
}
