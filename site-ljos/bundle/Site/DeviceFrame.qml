import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Site

// A framed "device" holding a live app: a title bar that says it runs,
// the app on its stage, and under it a row of tabs over the panels that
// tell about it (DevicePage), each a tab's. The tabs are one set, named
// `name`, so a reader hears them together; arrows move between them.
// A panel changes by a crossfade, which reduced motion keeps. With none
// chosen (`current` -1) Tab reaches the first of the tabs. The four
// parts stand one under another.
//
// In a shell whose devices are consoles (Theme `consoleLayout`), and where
// there is room, the panels named in `columns` stand beside the app
// instead, the first on its left and the second on its right, each a
// region under its own name, with no tabs: what the app is made of, the
// app and what drives it, seen at once. The other panels do not show.
Panel {
    id: frame

    property string name: t`Live app`
    property string title: ""
    property unknown tabs: []
    property int current: 0
    // How tall the stage and the panels are. A frame that opens with no
    // tab chosen may give the panels no height until one is.
    property int stageHeight: 280
    property int pageHeight: 240
    property alias stage: stageArea.data
    property alias pages: pageArea.data
    // A word at the bar's end, beside the light that says the app runs.
    property string status: t`Running`

    // The console's two side panels, by their tab's index, and the names
    // its three regions go by.
    property unknown columns: [1, 2]
    property unknown columnNames: [t`Observer tree`, t`Live stage`, t`Agent MCP stream`]
    readonly property bool consoleLayout: Theme.consoleAt(width)
    readonly property int side: Math.min(400, Math.round(width * 0.3))
    readonly property int heading: consoleLayout ? 32 : 0
    readonly property int bodyHeight: consoleLayout ? Math.max(stageHeight, pageHeight) : stageHeight
    // How wide the app's stage is: the frame's, or the console's middle.
    readonly property int stageWidth: consoleLayout ? width - 2 * side - 2 : width

    padding: 0
    color: Theme.surfaceRaised

    function pick(at) {
        frame.current = Math.max(0, Math.min(frame.tabs.length - 1, at));
    }
    // An arrow takes the focus along to the tab it chose, so the next
    // press goes on from there.
    function walk(at) {
        frame.pick(at);
        tabs.itemAt(frame.current)?.forceActiveFocus(FocusReason.Tab);
    }

    // The parts, each placed: under one another, or as a console.
    Item {
        id: body
        width: frame.width
        height: bar.height + frame.heading + frame.bodyHeight + (frame.consoleLayout ? 0 : tabRow.height + frame.pageHeight)

        // The bar: what the app is, and that it runs.
        Item {
            id: bar
            width: frame.width
            height: 44

            Text {
                x: Theme.m
                anchors.verticalCenter: parent.verticalCenter
                text: frame.title
                color: Theme.textMuted
                font.family: Theme.mono
                font.size: Theme.captionSize
            }
            Row {
                x: parent.width - width - Theme.m
                anchors.verticalCenter: parent.verticalCenter
                spacing: Theme.xs
                Rectangle {
                    Layout.alignment: Align.VCenter
                    width: 8
                    height: 8
                    radius: 4
                    fill: Theme.accent
                }
                Text {
                    Layout.alignment: Align.VCenter
                    text: frame.status
                    color: Theme.textMuted
                    font.family: Theme.sans
                    font.size: Theme.captionSize
                    font.weight: Font.Medium
                }
            }
            Rectangle {
                y: parent.height - 1
                width: parent.width
                height: 1
                fill: Theme.divider
            }
        }

        // The console's names over its three regions.
        Repeater {
            model: frame.consoleLayout ? 3 : 0
            Item {
                required property int index
                x: index === 0 ? 0 : index === 1 ? frame.side + 1 : frame.width - frame.side
                y: bar.height
                width: index === 1 ? frame.stageWidth : frame.side
                height: frame.heading
                Accessible.ignored: true

                Rectangle {
                    x: Theme.m
                    anchors.verticalCenter: parent.verticalCenter
                    width: 6
                    height: 6
                    fill: index === 1 ? Theme.accent : index === 0 ? Theme.accent3 : Theme.accent2
                }
                Text {
                    x: Theme.m + 6 + Theme.xs
                    anchors.verticalCenter: parent.verticalCenter
                    text: frame.columnNames[index]
                    color: Theme.textMuted
                    font.family: Theme.mono
                    font.size: Theme.captionSize
                }
                Rectangle {
                    y: parent.height - 1
                    width: parent.width
                    height: 1
                    fill: Theme.divider
                }
            }
        }
        // Between the console's regions.
        Repeater {
            model: frame.consoleLayout ? 2 : 0
            Rectangle {
                required property int index
                x: index === 0 ? frame.side : frame.width - frame.side - 1
                y: bar.height
                width: 1
                height: frame.heading + frame.bodyHeight
                fill: Theme.divider
            }
        }

        // The app itself.
        Item {
            id: stageArea
            x: frame.consoleLayout ? frame.side + 1 : 0
            y: bar.height + frame.heading
            width: frame.stageWidth
            height: frame.bodyHeight
            clip: true
            // Over the panels' empty middle in a console, so that never
            // takes the app's presses.
            z: frame.consoleLayout ? 1 : 0
            Accessible.role: frame.consoleLayout ? Accessible.Section : Accessible.NoRole
            Accessible.name: frame.consoleLayout ? frame.columnNames[1] : ""
        }

        // The tabs.
        Item {
            id: tabRow
            visible: !frame.consoleLayout
            y: stageArea.y + stageArea.height
            width: frame.width
            height: 44

            Rectangle {
                width: parent.width
                height: 1
                fill: Theme.divider
            }
            Rectangle {
                y: parent.height - 1
                width: parent.width
                height: 1
                fill: Theme.divider
            }
            Row {
                x: Theme.xs
                height: parent.height
                Accessible.role: Accessible.PageTabList
                Accessible.name: frame.name

                Repeater {
                    id: tabs
                    model: frame.tabs

                    Item {
                        id: tab
                        required property unknown modelData
                        required property int index
                        readonly property bool chosen: index === frame.current

                        width: words.implicitWidth + 2 * Theme.m
                        height: tabRow.height
                        activeFocusOnTab: chosen || (frame.current < 0 && index === 0)
                        Accessible.role: Accessible.PageTab
                        Accessible.name: modelData
                        Accessible.selected: chosen
                        Accessible.onPressAction: () => frame.pick(index)
                        Keys.onPressed: (event) => {
                            if (event.key === Key.Right || event.key === Key.Left) {
                                frame.walk(index + (event.key === Key.Right ? 1 : -1));
                                event.accepted = true;
                            } else if (event.key === Key.Return || event.key === Key.Enter || event.key === Key.Space) {
                                frame.pick(index);
                                event.accepted = true;
                            }
                        }

                        Text {
                            id: words
                            anchors.centerIn: parent
                            text: tab.modelData
                            color: tab.chosen ? Theme.text : Theme.textMuted
                            font.family: Theme.sans
                            font.size: Theme.uiSize
                            font.weight: tab.chosen ? Font.DemiBold : Font.Medium
                        }
                        // The chosen tab's mark, in the second colour.
                        Rectangle {
                            x: Theme.m
                            y: parent.height - 2
                            width: parent.width - 2 * Theme.m
                            height: 2
                            radius: 1
                            fill: Theme.accent2
                            opacity: tab.chosen ? 1 : 0
                            Behavior on opacity {
                                NumberAnimation {
                                    duration: Theme.enterSmall
                                    easing.type: Easing.OutCubic
                                }
                            }
                        }
                        PointerArea {
                            anchors.fill: parent
                            Accessible.ignored: true
                            cursorShape: Cursor.PointingHand
                            // A press gives the tab the focus too, as a button's
                            // does, so the arrows go on from the tab pressed.
                            onClicked: {
                                frame.pick(tab.index);
                                tab.forceActiveFocus(FocusReason.Mouse);
                            }
                        }
                    }
                }
            }
        }

        // The panels, one over another; DevicePage shows the current one. In
        // a console they stand at the sides, and the app between them.
        // They come after the tabs, so Tab goes from the chosen tab into its
        // panel; a console, with no tabs, is taken app first, then the
        // regions beside it, left before right.
        Item {
            id: pageArea
            y: frame.consoleLayout ? bar.height + frame.heading : tabRow.y + tabRow.height
            width: frame.width
            height: frame.consoleLayout ? frame.bodyHeight : frame.pageHeight
            clip: true
        }
    }
}
