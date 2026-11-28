import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Site
import "../nav.js" as Nav
import "logic/review.ts" as Review

// The same feature of the inbox in each picked framework's own code: a
// tab for each feature, then each picked framework's lines of it under
// its file and lines, coloured as code. The lines are the app's own,
// cut by the build from the file they name (scripts/review-data.mjs).
Column {
    id: code

    required property Review.Review review
    required property list<string> picked
    property bool wide: true
    property Flickable scroller
    // The feature shown, by its id.
    property string feature: Review.featureOf(code.review, "").id

    readonly property Review.Feature chosen: Review.featureOf(code.review, code.feature)
    readonly property real side: code.wide ? Math.floor((width - Theme.l) / 2) : width

    spacing: Theme.m
    Accessible.role: Accessible.Section
    Accessible.name: t`The code of each picked framework`

    function show(id: string): void {
        code.feature = id;
    }

    Flow {
        width: parent.width
        spacing: Theme.xxs
        Accessible.role: Accessible.PageTabList
        Accessible.name: t`Feature`

        Repeater {
            id: tabs
            model: code.review.features
            // One stop on Tab for the row, and the arrows go along it (the
            // ARIA tab pattern): the stop is the chosen feature's tab.
            function focusAt(at: int): void {
                const next = tabs.itemAt((at + tabs.count) % tabs.count);
                if (Review.isFocusable(next))
                    next.forceActiveFocus(FocusReason.Tab);
            }
            delegate: Rectangle {
                id: tab
                required property Review.Feature modelData
                required property int index
                readonly property bool chosen: tab.modelData.id === code.feature
                width: name.implicitWidth + 2 * Theme.s
                height: Theme.narrow ? Theme.target : 36
                radius: Theme.radiusSmall
                fill: tab.chosen ? Theme.surfaceSelected : press.containsMouse ? Theme.surfaceHover : Theme.surface
                border.color: tab.activeFocus ? Theme.focusRing : tab.chosen ? Theme.accent : Theme.border
                border.width: tab.activeFocus ? 2 : 1
                activeFocusOnTab: tab.chosen
                Accessible.role: Accessible.PageTab
                Accessible.name: tab.modelData.label
                Accessible.selected: tab.chosen
                Accessible.onPressAction: () => code.show(tab.modelData.id)
                Keys.onPressed: (event) => {
                    if (event.key === Key.Right || event.key === Key.Left) {
                        // Along the row as it is drawn: on a right-to-left
                        // page Right goes back. Past either end, round.
                        const forward = (event.key === Key.Right) !== (App.layoutDirection === Direction.RightToLeft);
                        tabs.focusAt(tab.index + (forward ? 1 : -1));
                        event.accepted = true;
                    } else if (event.key === Key.Return || event.key === Key.Enter || event.key === Key.Space) {
                        code.show(tab.modelData.id);
                        event.accepted = true;
                    }
                }

                Text {
                    id: name
                    anchors.centerIn: parent
                    text: tab.modelData.label
                    color: tab.chosen ? Theme.text : Theme.textMuted
                    font.family: Theme.sans
                    font.size: Theme.captionSize + 1
                    font.weight: tab.chosen ? Font.DemiBold : Font.Normal
                }
                PointerArea {
                    id: press
                    anchors.fill: parent
                    hoverEnabled: true
                    Accessible.ignored: true
                    cursorShape: Cursor.PointingHand
                    onClicked: code.show(tab.modelData.id)
                }
            }
        }
    }
    Text {
        x: App.layoutDirection === Direction.RightToLeft ? parent.width - width : 0
        width: Math.min(parent.width, Theme.measure)
        text: code.chosen.about
        color: Theme.textMuted
        font.family: Theme.sans
        font.size: Theme.bodySize - 1
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.bodyLine - 2
        wrap: Text.Wrap
    }

    Flow {
        width: parent.width
        spacing: Theme.l

        Repeater {
            model: Review.shownOf(code.review, code.chosen, code.picked)
            Column {
                id: one
                required property Review.Shown modelData
                readonly property string href: Review.hrefOf(one.modelData.excerpt)
                // Read here: inside the CodeBlock, `code` is its own text.
                readonly property Flickable scroller: code.scroller
                width: code.side
                spacing: Theme.xs

                Flow {
                    width: parent.width
                    spacing: Theme.s
                    Text {
                        text: one.modelData.name
                        color: Theme.text
                        font.family: Theme.sans
                        font.size: Theme.bodySize
                        font.weight: Font.DemiBold
                        readonly property int headingLevel: 3
                        Accessible.role: Accessible.Heading
                    }
                    // Its file and lines, linked to them where the app is
                    // published.
                    Text {
                        topPadding: 3
                        format: one.href !== "" ? Text.RichText : Text.PlainText
                        text: one.href !== "" ? Nav.anchor(one.href, one.modelData.where, false, Theme.link) : one.modelData.where
                        color: one.href !== "" ? Theme.link : Theme.textMuted
                        linkColor: Theme.link
                        font.family: Theme.mono
                        font.size: Theme.captionSize
                        onLinkActivated: (to) => Nav.go(to)
                    }
                }
                CodeBlock {
                    width: parent.width
                    scroller: one.scroller
                    lang: one.modelData.excerpt.lang
                    code: Review.codeOf(one.modelData.excerpt)
                    rich: one.modelData.excerpt.rich
                }
            }
        }
    }
}
