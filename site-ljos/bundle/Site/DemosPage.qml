import QtQuick
import Ljos.Blocks
import Site
import Demos
import "../Demos/later.js" as Later

// The demos page: complete Ljós apps running in the page, flagship
// first. Each demo stands in its named Slot as the slot's own
// delegate. The flagship is made with the page, so the prerendered
// page holds it as first made and hydration takes it over in place.
// The others stand in a frame their own size from the first paint,
// a picture of each in it, and are made once the reader presses its
// Run; a browser without wasm or WebGL 2 keeps the picture, and its
// words say what it shows. Each of those waits for its Run (Runner):
// what runs on a page is the reader's to start, and at most three run
// at once. The flagship has no Run: it holds still until pressed, as a
// plain example does, and its shell is the one compiled with the page. Nothing on this page is needed to read it. The sections
// are written out, not repeated over a model: a Slot's delegate is
// made by the Slot, in the Slot's place, and a Repeater's model is
// not its to give.
Column {
    id: demos

    property var scroller: null
    property bool wide: true
    readonly property int textWidth: width

    width: parent ? parent.width : 680
    spacing: Theme.xxl
    topPadding: demos.wide ? Theme.xl : Theme.m

    Column {
        width: parent.width
        spacing: Theme.s

        Text {
            width: parent.width
            text: "Live demos"
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: demos.wide ? Theme.displaySize : Theme.compactDisplaySize
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: demos.wide ? Theme.displayLine : Theme.compactDisplayLine
            wrapMode: Text.Wrap
            readonly property int headingLevel: 1
            Accessible.role: Accessible.Heading
        }
        Text {
            width: Math.min(parent.width, Theme.measure)
            text: "Each demo is a complete Ljós app that passes ljos check, compiled ahead of time and mounted in the page. The page reads with no script; where a demo cannot run — no wasm, no WebGL 2 — its picture and its words stand in its place."
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.subtitleSize - 1
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.subtitleLine - 2
            wrapMode: Text.Wrap
        }
    }

    DemoSection {
        width: demos.textWidth
        wide: demos.wide
        title: "A shell you rewrite"
        body: "The flagship: a small app whose shell you rewrite in the page's editor. Its data and state survive the swap; move a Slot and its contribution moves with it; break the shell and the app's own shell stands, with what broke shown."

        Slot {
            name: "demo-shell"
            delegate: Component {
                PantryDemo {
                    width: demos.textWidth
                }
            }
        }
    }

    DemoSection {
        width: demos.textWidth
        wide: demos.wide
        title: "3D you can orbit"
        body: "A Quick3D scene in the browser: drag to orbit it. The same scene runs natively under the same engine."

        Slot {
            name: "demo-orbit"
            delegate: Component {
                DemoFrame {
                    width: demos.textWidth
                    scroller: demos.scroller
                    needs: "webgl2"
                    route: "/demos/"
                    picture: "/pictures/demo-orbit.webp"
                    pictureDark: "/pictures/demo-orbit-dark.webp"
                    what: "the 3D demo"
                    description: "A lit 3D scene of shapes on a floor, which a drag turns."
                    source: Later.orbit
                }
            }
        }
    }

    DemoSection {
        width: demos.textWidth
        wide: demos.wide
        title: "A shader effect"
        body: "A custom shader over live content, written as part of the app — no toolkit-private path, nothing pre-baked."

        Slot {
            name: "demo-shader"
            delegate: Component {
                DemoFrame {
                    width: demos.textWidth
                    scroller: demos.scroller
                    needs: "webgl2"
                    route: "/demos/"
                    picture: "/pictures/demo-shader.webp"
                    pictureDark: "/pictures/demo-shader-dark.webp"
                    what: "the shader demo"
                    description: "Light pooling over a card of text, following the pointer."
                    source: Later.shader
                }
            }
        }
    }

    DemoSection {
        width: demos.textWidth
        wide: demos.wide
        title: "A whole app"
        body: "A real app of the corpus, not a toy: the whole program, running here as it runs on a desktop."

        Slot {
            name: "demo-app"
            delegate: Component {
                DemoFrame {
                    width: demos.textWidth
                    scroller: demos.scroller
                    needs: "wasm"
                    route: "/demos/"
                    picture: "/pictures/demo-app.webp"
                    pictureDark: "/pictures/demo-app-dark.webp"
                    what: "the field guide"
                    description: "A field guide to birds: a list of species beside the one picked, with notes and a count of those seen."
                    source: Later.fieldGuide
                }
            }
        }
    }

    DemoSection {
        width: demos.textWidth
        wide: demos.wide
        title: "Motion"
        body: "Animation as a property of the interface: one value, eased, driving everything that moves — and nothing at all moving, or costing, at rest."

        Slot {
            name: "demo-motion"
            delegate: Component {
                DemoFrame {
                    width: demos.textWidth
                    scroller: demos.scroller
                    needs: "wasm"
                    route: "/demos/"
                    picture: "/pictures/demo-motion.webp"
                    pictureDark: "/pictures/demo-motion-dark.webp"
                    what: "the motion demo"
                    description: "Tiles that shuffle and settle, driven by one eased value."
                    source: Later.motion
                }
            }
        }
    }
}
