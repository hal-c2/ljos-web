// Ljós's Core before QtQuick: only its t`` is wanted here, and any name
// both have stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import Ljos.Blocks
import Site
import Demos
import "../Demos/later.js" as Later
import "../nav.js" as Nav

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
            text: t`Live demos`
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
            text: t`Each demo is a complete Ljós app that passes ljos check, compiled ahead of time and mounted in this page. Press Run to start any framed demo, switch between light and dark themes in the header to watch it follow, and edit the live source in the Pantry and on the cockpit and smartwatch pages. Where a browser lacks WebAssembly, WebGL 2 or WebGPU, each demo keeps its picture and description.`
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
        title: t`A shell you rewrite`
        body: t`Add items to the basket, then edit Shell.qml right in the page. Move a Slot to rearrange the interface while the basket keeps its items, or introduce a syntax error: the last shell that compiled keeps running, with the compiler message shown beside the editor. Switch light and dark themes to watch both shells follow.`

        Slot {
            name: "demo-shell"
            delegate: Component {
                PantryDemo {
                    width: demos.textWidth
                }
            }
        }
    }

    // Each pro demo's card (Demos/pro.json): its picture, and the way to
    // its own page.
    Repeater {
        model: Content.pro
        delegate: DemoSection {
            id: card
            required property var modelData
            width: demos.textWidth
            wide: demos.wide
            title: modelData.card
            body: modelData.cardBody

            Column {
                width: demos.textWidth
                spacing: Theme.s

                Text {
                    width: parent.width
                    height: Math.round(width * card.modelData.height / card.modelData.width)
                    textFormat: Text.RichText
                    text: Nav.picture("/demos/", Nav.proPicture(card.modelData, Theme.picked, Theme.dark), width, height, card.modelData.cardAlt)
                }
                LinkButton {
                    label: card.modelData.open
                    href: card.modelData.route
                }
            }
        }
    }

    DemoSection {
        width: demos.textWidth
        wide: demos.wide
        title: t`3D you can orbit`
        body: t`Press Run to start a lit 3D scene rendered by the same engine that runs natively on desktop and mobile. Drag to orbit, scroll or pinch to zoom, and switch light and dark themes to watch the scene adapt.`

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
                    what: t`the 3D demo`
                    description: t`A lit 3D scene of shapes on a floor, which a drag turns.`
                    source: Later.orbit
                }
            }
        }
    }

    DemoSection {
        width: demos.textWidth
        wide: demos.wide
        title: t`A shader effect`
        body: t`Press Run, then move the pointer across the card to stir the light and tap to cycle colours. The shader runs over live app content rather than a pre-rendered texture, and follows the page's light and dark themes.`

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
                    what: t`the shader demo`
                    description: t`Light pooling over a card of text, following the pointer.`
                    source: Later.shader
                }
            }
        }
    }

    DemoSection {
        width: demos.textWidth
        wide: demos.wide
        title: t`A whole app`
        body: t`Press Run to open a bird field guide running in WebAssembly. Filter the list by typing in Search, pick a species to read its notes, mark birds as seen to update the counter, and switch light and dark themes while keeping your selection.`

        Slot {
            name: "demo-app"
            delegate: Component {
                DemoFrame {
                    width: demos.textWidth
                    scroller: demos.scroller
                    needs: "wasm"
                    route: "/demos/"
                    // Narrow, the guide stacks its list over its detail.
                    least: 520
                    picture: "/pictures/demo-app.webp"
                    pictureDark: "/pictures/demo-app-dark.webp"
                    what: t`the field guide`
                    description: t`A field guide to birds: a list of species beside the one picked, with notes and a count of those seen.`
                    source: Later.fieldGuide
                }
            }
        }
    }

    DemoSection {
        width: demos.textWidth
        wide: demos.wide
        title: t`Motion`
        body: t`Press Run, click Shuffle the tiles to watch them reorder on a single eased value, and press and drag in the spring tray so the puck springs after your pointer. When the motion settles, nothing ticks and an app at rest uses 0 % CPU.`

        Slot {
            name: "demo-motion"
            delegate: Component {
                DemoFrame {
                    width: demos.textWidth
                    scroller: demos.scroller
                    needs: "wasm"
                    route: "/demos/"
                    // Narrow, Motion's controls wrap onto two lines.
                    least: 440
                    picture: "/pictures/demo-motion.webp"
                    pictureDark: "/pictures/demo-motion-dark.webp"
                    what: t`the motion demo`
                    description: t`Tiles that shuffle and settle, driven by one eased value.`
                    source: Later.motion
                }
            }
        }
    }
}
