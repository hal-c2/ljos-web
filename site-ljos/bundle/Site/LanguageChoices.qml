import Ljos.Ui
import Site
import Ljos.Core
import Ljos.Layout
import Ljos.Controls as C
import "logic/languages.ts" as Languages

// The language switcher's popover (Site/LanguageSwitcher.qml): every
// language the site is read in, each named as it names itself, the one
// shown checked. It comes the first time the switcher is pressed
// (Site/later.js), with Ljós's own controls it is drawn in, and stands
// over the switcher's button, the item the popover opens beside.
Item {
    id: choices

    // The site's Preferences, given by the switcher once it is made.
    property Preferences preferences
    readonly property bool opened: popover.opened
    // Left by keys (a pick or Escape): the button that opened it takes
    // the keyboard back, as a menu gives it back in Qt.
    signal leftByKeys

    // Opened by keys, the language shown has the keyboard, so Up and
    // Down go through the others; opened by a pointer, nothing is ringed.
    property bool byKeys: false

    function toggle(keys: bool): void {
        byKeys = keys === true;
        popover.opened ? popover.close() : popover.open();
    }

    function row(at: int): Item {
        const count = rows.count;
        return count ? rows.itemAt(((at % count) + count) % count) : null;
    }

    function leave(): void {
        popover.close();
        if (byKeys) leftByKeys();
    }

    C.Popover {
        id: popover
        edge: Edge.Bottom
        width: 232
        padding: Theme.xs
        onOpened: {
            if (!choices.byKeys) return;
            const languages = choices.preferences !== null ? Languages.languagesIn(choices.preferences.languages) : [];
            const at = languages.findIndex((it) => it.tag === choices.preferences?.language);
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
                font.size: Theme.captionSize
                font.weight: Font.DemiBold
            }
            Repeater {
                id: rows
                model: choices.preferences !== null ? Languages.languagesIn(choices.preferences.languages) : []

                Rectangle {
                    id: row
                    required property Languages.Language modelData
                    required property int index
                    readonly property bool picked: choices.preferences !== null && choices.preferences.language === modelData.tag

                    width: 216
                    height: Math.max(Theme.rowLeast, name.implicitHeight + 2 * Theme.xxs)
                    radius: Theme.radiusSmall
                    fill: rowArea.pressed ? Theme.surfacePressed : row.picked ? Theme.surfaceSelected : rowArea.containsMouse || row.activeFocus ? Theme.surfaceHover : "transparent"
                    border.width: row.activeFocus ? 2 : 0
                    border.color: Theme.focusRing
                    activeFocusOnTab: true
                    Accessible.role: Accessible.RadioButton
                    Accessible.name: row.modelData.name
                    Accessible.description: Languages.nameIn(row.modelData.tag, choices.preferences !== null ? choices.preferences.language : "en")
                    Accessible.checkable: true
                    Accessible.checked: row.picked
                    Accessible.onPressAction: () => row.pick()
                    Keys.onPressed: (event: KeyEvent) => {
                        if (event.key === Key.Return || event.key === Key.Enter || event.key === Key.Space) {
                            row.pick();
                            event.accepted = true;
                        } else if (event.key === Key.Escape) {
                            choices.leave();
                            event.accepted = true;
                        } else if (event.key === Key.Down || event.key === Key.Up) {
                            choices.row(row.index + (event.key === Key.Down ? 1 : -1))?.forceActiveFocus();
                            event.accepted = true;
                        } else if (event.key === Key.Home || event.key === Key.End) {
                            choices.row(event.key === Key.Home ? 0 : -1)?.forceActiveFocus();
                            event.accepted = true;
                        }
                    }

                    function pick(): void {
                        choices.preferences?.setLanguage(row.modelData.tag);
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
                        font.size: Theme.captionSize + 1
                        font.weight: row.picked ? Font.DemiBold : Font.Normal
                        elide: Text.ElideRight
                    }
                    PointerArea {
                        id: rowArea
                        anchors.fill: parent
                        Accessible.ignored: true
                        hoverEnabled: true
                        cursorShape: Cursor.PointingHand
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
