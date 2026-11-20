import QtQuick
import Site
import Ljos.Core
import Ljos.Controls as C

// The switcher's popover (Site/ShellSwitcher.qml): the three shells and
// what each is, the note a narrow window needs, and the way to the
// shell's own QML. It comes the first time the switcher is pressed
// (Site/later.js), with Ljós's own controls it is drawn in. It stands
// over the switcher's button, the item the popover opens beside.
Item {
    id: choices

    property var preferences: null
    property string shown: "marketing"
    readonly property bool opened: popover.opened
    signal sourceAsked(string name)

    function toggle() {
        popover.opened ? popover.close() : popover.open();
    }

    C.Popover {
        id: popover
        edge: Qt.BottomEdge
        width: 320
        padding: Theme.xs

        contentItem: Column {
            spacing: Theme.xxs

            Text {
                leftPadding: Theme.xs
                topPadding: Theme.xxs
                bottomPadding: Theme.xxs
                text: t`Shell`
                color: Theme.textMuted
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
                font.weight: Font.DemiBold
            }
            Repeater {
                model: choices.preferences ? choices.preferences.shells : []

                Rectangle {
                    id: row
                    required property var modelData
                    readonly property bool picked: choices.preferences.shell === modelData.name

                    width: 304
                    height: words.implicitHeight + 2 * Theme.xs
                    radius: Theme.radiusSmall
                    color: rowArea.pressed ? Theme.surfacePressed : row.picked ? Theme.surfaceSelected : rowArea.containsMouse ? Theme.surfaceHover : "transparent"
                    activeFocusOnTab: true
                    Accessible.role: Accessible.RadioButton
                    Accessible.name: modelData.label
                    Accessible.description: modelData.about
                    Accessible.checkable: true
                    Accessible.checked: row.picked
                    Accessible.onPressAction: () => row.pick()
                    Keys.onPressed: (event) => {
                        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                            row.pick();
                            event.accepted = true;
                        }
                    }

                    function pick() {
                        choices.preferences.setShell(modelData.name);
                        popover.close();
                    }

                    C.Icon {
                        x: Theme.xs
                        y: Theme.xs + 2
                        name: "check"
                        size: 16
                        color: Theme.accent
                        visible: row.picked
                    }
                    Column {
                        id: words
                        x: Theme.xs + 24
                        y: Theme.xs
                        width: row.width - x - Theme.xs
                        spacing: 2

                        Text {
                            width: parent.width
                            text: row.modelData.label
                            color: Theme.text
                            font.family: Theme.sans
                            font.pixelSize: Theme.captionSize + 1
                            font.weight: Font.DemiBold
                        }
                        Text {
                            width: parent.width
                            text: row.modelData.about
                            color: Theme.textMuted
                            font.family: Theme.sans
                            font.pixelSize: Theme.captionSize
                            lineHeightMode: Text.FixedHeight
                            lineHeight: 18
                            wrapMode: Text.Wrap
                        }
                    }
                    MouseArea {
                        id: rowArea
                        anchors.fill: parent
                        Accessible.ignored: true
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: row.pick()
                    }
                }
            }
            Text {
                visible: choices.preferences !== null && !choices.preferences.wide
                width: 304
                leftPadding: Theme.xs
                rightPadding: Theme.xs
                topPadding: Theme.xxs
                text: t`Workbench and Desktop need a wider window. This one shows Marketing.`
                color: Theme.textMuted
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
                wrapMode: Text.Wrap
            }
            Rectangle {
                width: 304
                height: 1
                color: Theme.divider
            }
            C.Button {
                subtle: true
                iconName: "code"
                text: t`View this shell's source`
                onClicked: {
                    popover.close();
                    choices.sourceAsked(choices.shown);
                }
            }
        }
    }
}
