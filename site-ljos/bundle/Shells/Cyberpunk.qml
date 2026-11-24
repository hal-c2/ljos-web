import QtQuick
import Ljos.Core
import Ljos.Blocks

// A console for the running site: a rail along the top reads out what
// the page is doing as it does it (where the reader is, the time, how
// many objects are alive, the frame rate while something moves, and
// what draws), a rail down the left is where to go, numbered as a
// console's channels, and the page stands in the rest, on a canvas of
// still scanlines. On a phone the top is the name and one menu button,
// and the readings move to a bar along the bottom.
//
// Like every shell here, nothing in it is the site's: each part is a
// place (a Slot) the site puts its pieces in by name, and `site` is the
// site's state, so the file is one a reader may rewrite in the page.
Rectangle {
    id: shell
    objectName: "cyberpunkShell"

    property var site: null
    readonly property var router: site ? site.router : null
    readonly property bool wide: site ? site.preferences.wide : width >= 1000
    readonly property bool calm: site ? site.preferences.calm : false
    readonly property string route: router ? router.route : "/"
    readonly property bool docs: router !== null && router.docsRoute
    readonly property bool sidebarShown: wide && docs
    readonly property bool tocShown: sidebarShown && width >= 1520 && router.headings.length > 0 && !(site && site.docked > 0)
    readonly property bool menuOpen: site ? site.menuOpen && !wide : false
    readonly property int pageWidest: 1280
    readonly property int gutter: wide ? 24 : 16
    readonly property int railWidth: 200
    readonly property int hudHeight: 48
    readonly property int barHeight: 56

    // The page on how a shell is written: its channel of the rail.
    readonly property string shellsRoute: "/start/your-own-shell/"
    readonly property string metricsRoute: "/benchmarks/"
    // Where to go, each a channel. The benchmarks are one only once the
    // site has that page (a route it has no name for is not one).
    readonly property var channels: router === null ? [] : [
        { label: t`Console`, to: "/", current: route === "/" },
        { label: t`Demos`, to: "/demos/", current: router.demosRoute },
        { label: t`Showcase`, to: "/showcase/", current: router.showcaseRoute }
    ].concat(router.nameOf(metricsRoute) !== metricsRoute ? [{ label: t`Metrics`, to: metricsRoute, current: route === metricsRoute }] : []).concat([
        { label: t`Docs`, to: "/start/", current: docs && route !== shellsRoute && route !== metricsRoute },
        { label: t`Shells`, to: shellsRoute, current: route === shellsRoute }
    ])

    // The colours and faces the site draws in: none of its own before it
    // is given the site.
    QtObject {
        id: look
        readonly property var theme: shell.site ? shell.site.theme : null
        readonly property bool dark: theme ? theme.dark : true
        readonly property color canvas: theme ? theme.canvas : "transparent"
        readonly property color surface: theme ? theme.surface : "transparent"
        readonly property color hover: theme ? theme.surfaceHover : "transparent"
        readonly property color divider: theme ? theme.divider : "transparent"
        readonly property color accent: theme ? theme.accent : "transparent"
        readonly property color accent2: theme ? theme.accent2 : "transparent"
        readonly property color link: theme ? theme.link : "transparent"
        readonly property color text: theme ? theme.text : "transparent"
        readonly property color muted: theme ? theme.textMuted : "transparent"
        readonly property string mono: theme ? theme.mono : "monospace"
        readonly property string sans: theme ? theme.sans : "sans-serif"
    }

    // The readings. The time, to the minute, woken once a minute at its
    // turn; the frame rate, measured only while something moves (the
    // shell coming in, the page scrolling) and kept after, so a page at
    // rest asks for no frames.
    property string clock: ""
    property int fps: 0
    readonly property int alive: site ? site.alive : 0
    readonly property string renderer: site ? site.renderer : ""
    readonly property real offset: site ? site.pageOffset : 0

    function tick() {
        var now = new Date();
        shell.clock = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
        minute.interval = 60000 - now.getSeconds() * 1000 - now.getMilliseconds() + 20;
        minute.restart();
    }
    function sample() {
        frames.running = true;
        settle.restart();
    }
    Timer {
        id: minute
        onTriggered: shell.tick()
    }
    FrameAnimation {
        id: frames
        onTriggered: {
            if (frames.smoothFrameTime > 0)
                shell.fps = Math.round(1 / frames.smoothFrameTime);
        }
    }
    Timer {
        id: settle
        interval: 1200
        onTriggered: frames.running = false
    }
    onOffsetChanged: sample()
    onSiteChanged: if (site) site.measureRenderer()
    Component.onCompleted: {
        tick();
        sample();
        if (site)
            site.measureRenderer();
    }

    width: parent ? parent.width : 1440
    height: parent ? parent.height : 900
    color: look.canvas

    // One reading of the rails: what it is, muted, and its value in the
    // accent, said to a reader as one line.
    component Reading: Item {
        id: reading
        property string label: ""
        property string value: ""
        property string said: ""
        // Stacked, a phone's: the label over its value.
        property bool stacked: false
        implicitWidth: stacked ? Math.max(labelText.implicitWidth, valueText.implicitWidth) : labelText.implicitWidth + 8 + valueText.implicitWidth
        implicitHeight: stacked ? 36 : 20
        Accessible.role: Accessible.StaticText
        Accessible.name: said

        Text {
            id: labelText
            text: reading.label
            color: look.muted
            font.family: look.mono
            font.pixelSize: 12
            lineHeightMode: Text.FixedHeight
            lineHeight: reading.stacked ? 16 : 20
            Accessible.ignored: true
        }
        Text {
            id: valueText
            x: reading.stacked ? 0 : labelText.implicitWidth + 8
            y: reading.stacked ? 18 : 0
            width: reading.stacked ? reading.width : implicitWidth
            text: reading.value
            elide: Text.ElideMiddle
            color: look.link
            font.family: look.mono
            font.pixelSize: 12
            font.weight: Font.DemiBold
            lineHeightMode: Text.FixedHeight
            lineHeight: reading.stacked ? 18 : 20
            Accessible.ignored: true
        }
    }

    // A channel of the rail: its number, its name, and a page's address
    // (an `a` a reader can open in a new tab), or, as `action`, a button
    // that says it was `pressed` (an item is made a link or not as it is
    // written, so this is said as written too). The one the
    // reader is on is lit; under the pointer its edge splits into the
    // second colour and the first, as a misaligned screen's does.
    component Channel: Item {
        id: channel
        property int number: 1
        property string label: ""
        property string to: ""
        property bool current: false
        property bool action: false
        readonly property string href: to !== "" && shell.router ? shell.router.address(to) : ""
        signal pressed

        width: parent ? parent.width : 168
        height: shell.wide ? 40 : 44
        activeFocusOnTab: true
        Accessible.role: action ? Accessible.Button : Accessible.Link
        Accessible.name: label
        Accessible.selected: current
        Accessible.onPressAction: () => channel.press()
        Keys.onPressed: (event) => {
            if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                channel.press();
                event.accepted = true;
            }
        }
        function press() {
            if (action)
                channel.pressed();
            else if (shell.router)
                shell.router.go(to);
        }

        Rectangle {
            x: -1
            width: parent.width
            height: parent.height
            color: "transparent"
            border.color: look.accent2
            border.width: 1
            opacity: area.containsMouse ? 0.9 : 0
            Accessible.ignored: true
        }
        Rectangle {
            x: 1
            width: parent.width
            height: parent.height
            color: "transparent"
            border.color: look.accent
            border.width: 1
            opacity: area.containsMouse ? 0.9 : 0
            Accessible.ignored: true
        }
        Rectangle {
            anchors.fill: parent
            color: channel.current ? look.hover : "transparent"
            border.color: channel.activeFocus ? look.accent : "transparent"
            border.width: 2
            Accessible.ignored: true
        }
        Rectangle {
            visible: channel.current
            width: 2
            height: parent.height
            color: look.accent
            Accessible.ignored: true
        }
        Text {
            x: 14
            anchors.verticalCenter: parent.verticalCenter
            text: String(channel.number).padStart(2, "0")
            color: channel.current ? look.link : look.muted
            font.family: look.mono
            font.pixelSize: 12
            Accessible.ignored: true
        }
        Text {
            x: 44
            anchors.verticalCenter: parent.verticalCenter
            text: channel.label
            color: channel.current ? look.link : look.text
            font.family: look.sans
            font.pixelSize: 15
            font.weight: channel.current ? Font.DemiBold : Font.Normal
            Accessible.ignored: true
        }
        MouseArea {
            id: area
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            Accessible.ignored: true
            onClicked: channel.press()
        }
    }

    // The canvas's scanlines: a line every third pixel, still, and under
    // everything, so they stand between the reader and nothing they press.
    Image {
        anchors.fill: parent
        fillMode: Image.Tile
        sourceSize.width: 4
        sourceSize.height: 3
        source: "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='4' height='3'><rect y='2' width='4' height='1' fill='" + (look.dark ? "#00f0ff" : "#05060a") + "' fill-opacity='" + (look.dark ? "0.05" : "0.035") + "'/></svg>")
        Accessible.ignored: true
    }

    // The top rail. Each part of the shell is a landmark, so a reader
    // goes to the page, the channels or the readings as a sighted one
    // looks.
    Rectangle {
        id: hud
        z: 3
        width: parent.width
        height: shell.wide ? shell.hudHeight : 56
        color: look.canvas
        Accessible.role: Accessible.Section
        Accessible.name: "Ljós"

        Rectangle {
            y: parent.height - 1
            width: parent.width
            height: 1
            color: look.accent
            opacity: 0.55
        }
        Row {
            x: shell.gutter
            anchors.verticalCenter: parent.verticalCenter
            spacing: 28

            Row {
                anchors.verticalCenter: parent.verticalCenter
                Slot { name: "site.brand" }
            }
            Row {
                visible: shell.wide
                anchors.verticalCenter: parent.verticalCenter
                spacing: 24

                Reading {
                    label: t`Route`
                    value: shell.route
                    said: t`Route ${shell.route}`
                }
                Reading {
                    visible: shell.width >= 1180
                    label: t`Clock`
                    value: shell.clock
                    said: t`Clock ${shell.clock}`
                }
                Reading {
                    label: t`Objects alive`
                    value: String(shell.alive)
                    said: t`Objects alive ${shell.alive}`
                }
                Reading {
                    label: t`Frame rate`
                    value: shell.fps > 0 ? t`${shell.fps} fps` : "--"
                    said: shell.fps > 0 ? t`Frame rate ${shell.fps} fps` : t`Frame rate not measured yet`
                }
                Reading {
                    visible: shell.width >= 1300 && shell.renderer !== ""
                    label: t`Renderer`
                    value: shell.renderer
                    said: t`Renderer ${shell.renderer}`
                }
            }
        }
        Row {
            x: parent.width - width - (shell.wide ? shell.gutter : shell.gutter - 8)
            anchors.verticalCenter: parent.verticalCenter
            spacing: 12

            Row {
                visible: shell.wide
                anchors.verticalCenter: parent.verticalCenter
                Slot { name: "site.github" }
            }
            Row {
                visible: shell.wide
                anchors.verticalCenter: parent.verticalCenter
                Slot { name: "site.switcher" }
            }
            Row {
                visible: shell.wide
                anchors.verticalCenter: parent.verticalCenter
                Slot { name: "site.preferences" }
            }
            // A phone's one control: the menu.
            Row {
                visible: !shell.wide
                anchors.verticalCenter: parent.verticalCenter
                Slot { name: "site.menu" }
            }
        }
    }

    // The channels, down the left: search over them, the shell's own
    // source under them.
    Rectangle {
        id: rail
        visible: shell.wide
        y: hud.height
        width: shell.railWidth
        height: parent.height - y
        color: look.canvas
        Accessible.role: Accessible.Section
        Accessible.name: t`Sections`

        Rectangle {
            x: parent.width - 1
            width: 1
            height: parent.height
            color: look.divider
        }
        Column {
            x: 16
            y: 16
            width: parent.width - 32
            spacing: 4

            Item {
                z: 2
                width: parent.width
                height: 40
                Slot { name: "site.search" }
            }
            Item {
                width: 1
                height: 16
            }
            Repeater {
                model: shell.channels

                Channel {
                    required property var modelData
                    required property int index
                    number: index + 1
                    label: modelData.label
                    to: modelData.to
                    current: modelData.current
                }
            }
            Item {
                width: 1
                height: 16
            }
            Rectangle {
                width: parent.width
                height: 1
                color: look.divider
            }
            Item {
                width: 1
                height: 12
            }
            Channel {
                number: shell.channels.length + 1
                action: true
                label: t`Source`
                onPressed: if (shell.site) shell.site.showSource("cyberpunk")
            }
        }
    }

    // The docs, beside the channels.
    Item {
        id: sidebar
        visible: shell.sidebarShown
        x: rail.width
        y: hud.height
        width: 264
        height: parent.height - y
        Slot { name: "site.sidebar" }
    }
    Rectangle {
        visible: shell.sidebarShown
        x: sidebar.x + sidebar.width
        y: hud.height
        width: 1
        height: parent.height - y
        color: look.divider
    }

    // The page itself, the footer under it.
    Item {
        id: page
        x: !shell.wide ? 0 : shell.sidebarShown ? sidebar.x + sidebar.width + 1 : rail.width
        y: hud.height
        width: parent.width - x - (shell.tocShown ? toc.width : 0)
        height: parent.height - y - (shell.wide ? 0 : shell.barHeight)
        Slot { name: "site.page" }
    }

    // On this page, beside it where there is room.
    Item {
        id: toc
        visible: shell.tocShown
        x: parent.width - width
        y: hud.height
        width: 224
        height: parent.height - y
        Slot { name: "site.toc" }
    }

    // A phone's readings, along the bottom.
    Rectangle {
        id: bar
        z: 3
        visible: !shell.wide
        y: parent.height - height
        width: parent.width
        height: shell.barHeight
        color: look.canvas
        Accessible.role: Accessible.Section
        Accessible.name: t`Telemetry`

        Rectangle {
            width: parent.width
            height: 1
            color: look.accent
            opacity: 0.55
        }
        Row {
            id: readings
            x: shell.gutter
            anchors.verticalCenter: parent.verticalCenter
            spacing: 12

            Reading {
                stacked: true
                width: Math.max(64, bar.width - 2 * shell.gutter - 3 * readings.spacing - aliveReading.width - fpsReading.width - clockReading.width)
                label: t`Route`
                value: shell.route
                said: t`Route ${shell.route}`
            }
            Reading {
                id: aliveReading
                stacked: true
                width: implicitWidth
                label: t`Objects`
                value: String(shell.alive)
                said: t`Objects alive ${shell.alive}`
            }
            Reading {
                id: fpsReading
                stacked: true
                width: implicitWidth
                label: t`Frame rate`
                value: shell.fps > 0 ? t`${shell.fps} fps` : "--"
                said: shell.fps > 0 ? t`Frame rate ${shell.fps} fps` : t`Frame rate not measured yet`
            }
            Reading {
                id: clockReading
                stacked: true
                width: implicitWidth
                label: t`Clock`
                value: shell.clock
                said: t`Clock ${shell.clock}`
            }
        }
    }

    // A phone's menu: search, where to go, the reader's choices, what is
    // on this page and the docs. It rises into place, or with reduced
    // motion only fades.
    Rectangle {
        id: menu
        z: 2
        Accessible.role: Accessible.Section
        Accessible.name: t`Menu`
        width: parent.width
        y: hud.height + (shell.menuOpen || shell.calm ? 0 : -16)
        height: parent.height - hud.height - shell.barHeight
        visible: !shell.wide && (shell.menuOpen || opacity > 0)
        opacity: shell.menuOpen ? 1 : 0
        color: look.canvas
        Behavior on opacity {
            NumberAnimation {
                duration: shell.menuOpen ? 250 : 100
                easing.type: Easing.OutCubic
            }
        }
        Behavior on y {
            NumberAnimation {
                duration: shell.menuOpen ? 250 : 100
                easing.type: Easing.OutCubic
            }
        }

        Flickable {
            anchors.fill: parent
            contentWidth: width
            contentHeight: menuColumn.implicitHeight + 48
            clip: true

            Column {
                id: menuColumn
                x: shell.gutter
                y: 24
                width: parent.width - 2 * shell.gutter
                spacing: 24

                Item {
                    z: 2
                    width: parent.width
                    height: 44
                    Slot { name: "site.search" }
                }
                Column {
                    width: parent.width
                    spacing: 4
                    Repeater {
                        model: shell.channels

                        Channel {
                            required property var modelData
                            required property int index
                            number: index + 1
                            label: modelData.label
                            to: modelData.to
                            current: modelData.current
                        }
                    }
                }
                Row {
                    spacing: 8
                    Slot { name: "site.github" }
                    Slot { name: "site.preferences" }
                }
                Row {
                    Slot { name: "site.switcher" }
                }
                Column {
                    visible: shell.docs
                    width: parent.width
                    Slot { name: "site.toc.inline" }
                }
                Rectangle {
                    width: parent.width
                    height: 1
                    color: look.divider
                }
                Column {
                    width: parent.width
                    Slot { name: "site.docs.inline" }
                }
            }
        }
    }
}
