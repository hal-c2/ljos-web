// Ljós's Core before QtQuick: only its t`` is wanted here.
import Ljos.Core
import QtQuick
import Site

// A framed "device" holding a live app: a title bar that says it runs,
// the app on its stage, and under it a row of tabs over the panels that
// tell about it (DevicePage), each a tab's. The tabs are one set, named
// `name`, so a reader hears them together; arrows move between them.
// A panel changes by a crossfade, which reduced motion keeps. With none
// chosen (`current` -1) Tab reaches the first of the tabs. The four
// parts stand one under another in the Panel's column.
Panel {
    id: frame

    property string name: t`Live app`
    property string title: ""
    property var tabs: []
    property int current: 0
    // How tall the stage and the panels are. A frame that opens with no
    // tab chosen may give the panels no height until one is.
    property int stageHeight: 280
    property int pageHeight: 240
    property alias stage: stageArea.data
    property alias pages: pageArea.data
    // A word at the bar's end, beside the light that says the app runs.
    property string status: t`Running`

    padding: 0
    color: Theme.surfaceRaised

    function pick(at) {
        frame.current = Math.max(0, Math.min(frame.tabs.length - 1, at));
    }
    // An arrow takes the focus along to the tab it chose, so the next
    // press goes on from there.
    function walk(at) {
        frame.pick(at);
        tabs.itemAt(frame.current)?.forceActiveFocus(Qt.TabFocusReason);
    }

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
            font.pixelSize: Theme.captionSize
        }
        Row {
            x: parent.width - width - Theme.m
            anchors.verticalCenter: parent.verticalCenter
            spacing: Theme.xs
            Rectangle {
                anchors.verticalCenter: parent.verticalCenter
                width: 8
                height: 8
                radius: 4
                color: Theme.accent
            }
            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: frame.status
                color: Theme.textMuted
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
                font.weight: Font.Medium
            }
        }
        Rectangle {
            y: parent.height - 1
            width: parent.width
            height: 1
            color: Theme.divider
        }
    }

    // The app itself.
    Item {
        id: stageArea
        width: frame.width
        height: frame.stageHeight
        clip: true
    }

    // The tabs.
    Item {
        id: tabRow
        width: frame.width
        height: 44

        Rectangle {
            width: parent.width
            height: 1
            color: Theme.divider
        }
        Rectangle {
            y: parent.height - 1
            width: parent.width
            height: 1
            color: Theme.divider
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
                    required property var modelData
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
                        if (event.key === Qt.Key_Right || event.key === Qt.Key_Left) {
                            frame.walk(index + (event.key === Qt.Key_Right ? 1 : -1));
                            event.accepted = true;
                        } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
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
                        font.pixelSize: Theme.uiSize
                        font.weight: tab.chosen ? Font.DemiBold : Font.Medium
                    }
                    // The chosen tab's mark, in the second colour.
                    Rectangle {
                        x: Theme.m
                        y: parent.height - 2
                        width: parent.width - 2 * Theme.m
                        height: 2
                        radius: 1
                        color: Theme.accent2
                        opacity: tab.chosen ? 1 : 0
                        Behavior on opacity {
                            NumberAnimation {
                                duration: Theme.enterSmall
                                easing.type: Easing.OutCubic
                            }
                        }
                    }
                    MouseArea {
                        anchors.fill: parent
                        Accessible.ignored: true
                        cursorShape: Qt.PointingHandCursor
                        // A press gives the tab the focus too, as a button's
                        // does, so the arrows go on from the tab pressed.
                        onClicked: {
                            frame.pick(tab.index);
                            tab.forceActiveFocus(Qt.MouseFocusReason);
                        }
                    }
                }
            }
        }
    }

    // The panels, one over another; DevicePage shows the current one.
    Item {
        id: pageArea
        width: frame.width
        height: frame.pageHeight
        clip: true
    }
}
