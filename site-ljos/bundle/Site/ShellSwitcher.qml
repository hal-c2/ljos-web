import QtQuick
import Site
import Ljos.Core
import Ljos.Controls as C

// Which shell frames the site: a button naming the one shown, and a
// popover with the three and what each is, the note a narrow window
// needs, and the way to the shell's own QML. Picking one swaps the shell
// live (Main.qml): the page and what the reader did on it stay.
Item {
    id: switcher

    property var preferences: null
    // Shown with its words, or as an icon where a toolbar is tight.
    property bool compact: false
    // Asked to show a shell's own QML (Site/ShellSource.qml).
    signal sourceAsked(string name)

    readonly property string shown: preferences ? preferences.shown : "marketing"

    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    C.Button {
        id: button
        subtle: true
        chevron: !switcher.compact
        iconName: "settings"
        display: switcher.compact ? C.Button.IconOnly : C.Button.TextBesideIcon
        text: switcher.preferences ? switcher.preferences.labelOf(switcher.shown) : ""
        Accessible.name: t`Shell`
        Accessible.description: switcher.preferences ? switcher.preferences.labelOf(switcher.shown) : ""
        onClicked: choices.opened ? choices.close() : choices.open()

        C.Popover {
            id: choices
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
                    model: switcher.preferences ? switcher.preferences.shells : []

                    Rectangle {
                        id: row
                        required property var modelData
                        readonly property bool picked: switcher.preferences.shell === modelData.name

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
                            switcher.preferences.setShell(modelData.name);
                            choices.close();
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
                    visible: switcher.preferences !== null && !switcher.preferences.wide
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
                        choices.close();
                        switcher.sourceAsked(switcher.shown);
                    }
                }
            }
        }
    }
}
