import QtQuick
import Site
import Ljos.Core
import Ljos.Controls as C

// The language switcher's popover (Site/LanguageSwitcher.qml): every
// language the site is read in, each named as it names itself, the one
// shown checked. It comes the first time the switcher is pressed
// (Site/later.js), with Ljós's own controls it is drawn in, and stands
// over the switcher's button, the item the popover opens beside.
Item {
    id: choices

    property var preferences: null
    readonly property bool opened: popover.opened
    // Left by keys (a pick or Escape): the button that opened it takes
    // the keyboard back, as a menu gives it back in Qt.
    signal leftByKeys

    // Opened by keys, the language shown has the keyboard, so Up and
    // Down go through the others; opened by a pointer, nothing is ringed.
    property bool byKeys: false

    function toggle(keys) {
        byKeys = keys === true;
        popover.opened ? popover.close() : popover.open();
    }

    function row(at) {
        const count = rows.count;
        return count ? rows.itemAt(((at % count) + count) % count) : null;
    }

    function leave() {
        popover.close();
        if (byKeys) leftByKeys();
    }

    C.Popover {
        id: popover
        edge: Qt.BottomEdge
        width: 232
        padding: Theme.xs
        onOpened: {
            if (!choices.byKeys) return;
            const languages = choices.preferences ? choices.preferences.languages : [];
            const at = languages.findIndex((it) => it.tag === choices.preferences.language);
            choices.row(Math.max(0, at))?.forceActiveFocus();
        }

        contentItem: Column {
            spacing: 2

            Text {
                width: 216
                leftPadding: Theme.xs
                rightPadding: Theme.xs
                topPadding: Theme.xxs
                bottomPadding: Theme.xxs
                text: t`Language`
                color: Theme.textMuted
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
                font.weight: Font.DemiBold
            }
            Repeater {
                id: rows
                model: choices.preferences ? choices.preferences.languages : []

                Rectangle {
                    id: row
                    required property var modelData
                    required property int index
                    readonly property bool picked: choices.preferences.language === modelData.tag

                    width: 216
                    height: Math.max(Theme.rowLeast, name.implicitHeight + 2 * Theme.xxs)
                    radius: Theme.radiusSmall
                    color: rowArea.pressed ? Theme.surfacePressed : row.picked ? Theme.surfaceSelected : rowArea.containsMouse || row.activeFocus ? Theme.surfaceHover : "transparent"
                    border.width: row.activeFocus ? 2 : 0
                    border.color: Theme.focusRing
                    activeFocusOnTab: true
                    Accessible.role: Accessible.RadioButton
                    Accessible.name: modelData.name
                    Accessible.description: modelData.english
                    Accessible.checkable: true
                    Accessible.checked: row.picked
                    Accessible.onPressAction: () => row.pick()
                    Keys.onPressed: (event) => {
                        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                            row.pick();
                            event.accepted = true;
                        } else if (event.key === Qt.Key_Escape) {
                            choices.leave();
                            event.accepted = true;
                        } else if (event.key === Qt.Key_Down || event.key === Qt.Key_Up) {
                            choices.row(row.index + (event.key === Qt.Key_Down ? 1 : -1))?.forceActiveFocus();
                            event.accepted = true;
                        } else if (event.key === Qt.Key_Home || event.key === Qt.Key_End) {
                            choices.row(event.key === Qt.Key_Home ? 0 : -1)?.forceActiveFocus();
                            event.accepted = true;
                        }
                    }

                    function pick() {
                        choices.preferences.setLanguage(modelData.tag);
                        choices.leave();
                    }

                    // Anchored, not placed, so a right-to-left page
                    // mirrors the row: the check on the right, the name
                    // read from there.
                    C.Icon {
                        id: check
                        anchors.left: parent.left
                        anchors.leftMargin: Theme.xs
                        anchors.verticalCenter: parent.verticalCenter
                        name: "check"
                        size: 16
                        color: Theme.accent
                        visible: row.picked
                    }
                    Text {
                        id: name
                        anchors.left: parent.left
                        anchors.leftMargin: Theme.xs + 24
                        anchors.right: parent.right
                        anchors.rightMargin: Theme.xs
                        anchors.verticalCenter: parent.verticalCenter
                        text: row.modelData.name
                        color: Theme.text
                        font.family: Theme.sans
                        font.pixelSize: Theme.captionSize + 1
                        font.weight: row.picked ? Font.DemiBold : Font.Normal
                        elide: Text.ElideRight
                    }
                    MouseArea {
                        id: rowArea
                        anchors.fill: parent
                        Accessible.ignored: true
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            choices.byKeys = false;
                            row.pick();
                        }
                    }
                }
            }
        }
    }
}
