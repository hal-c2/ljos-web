import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Site
import "logic/review.ts" as Review

// Which renderer set the numbers are shown in: one choice of a row, as
// radio buttons, the GPU first. Every timed chart and the table follow
// it, and say under them how the set ran. One stop on Tab for the row,
// the chosen choice, and the arrows go along it (the ARIA radio group
// pattern); Return, Enter or Space chooses.
Column {
    id: sets

    required property Review.Review review
    // The set shown, by its id.
    property string chosen: Review.firstSet(sets.review)

    spacing: Theme.xs
    Accessible.role: Accessible.Grouping
    Accessible.name: t`Renderer`

    function choose(id: string): void {
        sets.chosen = id;
    }

    Text {
        width: parent.width
        text: t`Renderer`
        color: Theme.textMuted
        font.family: Theme.sans
        font.size: Theme.captionSize
        font.weight: Font.DemiBold
        Accessible.ignored: true
    }
    Flow {
        width: parent.width
        spacing: Theme.xxs

        Repeater {
            id: choices
            model: sets.review.sets ?? []
            function focusAt(at: int): void {
                const next = choices.itemAt((at + choices.count) % choices.count);
                if (Review.isFocusable(next))
                    next.forceActiveFocus(FocusReason.Tab);
            }
            delegate: Rectangle {
                id: choice
                objectName: "reviewRenderer"
                required property Review.RendererSet modelData
                required property int index
                readonly property bool picked: choice.modelData.id === sets.chosen
                width: label.implicitWidth + 2 * Theme.s + 18
                height: Theme.narrow ? Theme.target : 36
                radius: Theme.radiusSmall
                fill: choice.picked ? Theme.surfaceSelected : press.containsMouse ? Theme.surfaceHover : Theme.surface
                border.color: choice.activeFocus ? Theme.focusRing : choice.picked ? Theme.accent : Theme.border
                border.width: choice.activeFocus ? 2 : 1
                activeFocusOnTab: choice.picked
                Accessible.role: Accessible.RadioButton
                Accessible.name: choice.modelData.label
                Accessible.checkable: true
                Accessible.checked: choice.picked
                Accessible.onPressAction: () => sets.choose(choice.modelData.id)
                Keys.onPressed: (event) => {
                    if (event.key === Key.Right || event.key === Key.Left || event.key === Key.Down || event.key === Key.Up) {
                        // Along the row as it is drawn: on a right-to-left
                        // page Right goes back. An arrow chooses as it
                        // moves, as a radio group's does. Past either end,
                        // round.
                        const rtl = App.layoutDirection === Direction.RightToLeft;
                        const ahead = event.key === Key.Down || (event.key === Key.Right && !rtl) || (event.key === Key.Left && rtl);
                        const at = (choice.index + (ahead ? 1 : -1) + choices.count) % choices.count;
                        const next = Review.setsOf(sets.review)[at];
                        if (next !== undefined)
                            sets.choose(next.id);
                        choices.focusAt(at);
                        event.accepted = true;
                    } else if (event.key === Key.Return || event.key === Key.Enter || event.key === Key.Space) {
                        sets.choose(choice.modelData.id);
                        event.accepted = true;
                    }
                }

                // The radio's dot: a ring, filled where chosen.
                Rectangle {
                    x: App.layoutDirection === Direction.RightToLeft ? parent.width - Theme.s - width : Theme.s
                    anchors.verticalCenter: parent.verticalCenter
                    width: 12
                    height: 12
                    radius: 6
                    fill: "transparent"
                    border.color: choice.picked ? Theme.accent : Theme.textMuted
                    border.width: 1
                    Rectangle {
                        visible: choice.picked
                        anchors.centerIn: parent
                        width: 6
                        height: 6
                        radius: 3
                        fill: Theme.accent
                    }
                }
                Text {
                    id: label
                    x: App.layoutDirection === Direction.RightToLeft ? Theme.s : Theme.s + 18
                    anchors.verticalCenter: parent.verticalCenter
                    text: choice.modelData.label
                    color: choice.picked ? Theme.text : Theme.textMuted
                    font.family: Theme.sans
                    font.size: Theme.captionSize + 1
                    font.weight: choice.picked ? Font.DemiBold : Font.Normal
                    Accessible.ignored: true
                }
                PointerArea {
                    id: press
                    anchors.fill: parent
                    hoverEnabled: true
                    Accessible.ignored: true
                    cursorShape: Cursor.PointingHand
                    onClicked: sets.choose(choice.modelData.id)
                }
            }
        }
    }
}
