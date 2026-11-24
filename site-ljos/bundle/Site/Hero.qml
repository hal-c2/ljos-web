import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Site
import "../nav.js" as Nav

// The front page's first screen: what Ljós is, on the left, and the
// page's live demo on the right in the wash, both from the same top; on
// a phone, or where the two would not stand side by side, the demo
// follows the words.
// The words, the calls to act and the demo are the page's (Landing), the
// wash and how they stand the shell's.
Item {
    id: hero

    property string eyebrow: ""
    property string title: ""
    property string subtitle: ""
    property bool wide: true
    // How many of the grid's twelve columns the words take beside the
    // demo: the demo has the rest. It stands there on a wide page where
    // the width it gets is at least `stageFrom`, the narrowest the demo
    // shows itself whole in; narrower, it follows the words, as wide as
    // the page.
    property int wordsColumns: 6
    property int stageFrom: 0
    readonly property bool beside: wide && sideStageWidth >= stageFrom
    // What the demo is and what can be done with it, under the wash.
    property string caption: ""
    // The calls to act, a row of LinkButtons.
    default property alias actions: actionRow.data
    // The demo, as wide as `stageWidth`.
    property alias stage: stageArea.data
    readonly property int stageWidth: deviceSide.width - 2 * reach
    // How far the wash reaches round the demo. On a phone it runs a small
    // step into the page's gutter and is a smaller one thick, so the demo
    // is a little wider than the page's column: the room it keeps inside
    // its own edge (AgentView's pad) costs its code none of its size.
    // Wide, it is the step that leaves a 1280 laptop's demo, padded, room
    // to stand beside the words.
    readonly property int reach: wide ? Theme.l : Theme.xs
    readonly property bool bleeds: !wide
    readonly property int bleed: bleeds ? Theme.s : 0
    signal followed(string link)

    // Words with room to spare keep a gap of their own from the wash;
    // a column of four needs all of it.
    readonly property bool roomy: beside && wordsColumns > 4
    readonly property real column: (width - (Theme.columns - 1) * Theme.columnGap) / Theme.columns
    readonly property int sideWordsWidth: Math.round(wordsColumns * column + (wordsColumns - 1) * Theme.columnGap)
    // The demo's width beside the words: the rest, less the gap before
    // the wash and the wash's reach round it.
    readonly property int sideStageWidth: width - sideWordsWidth - Theme.columnGap - 2 * reach
    readonly property int wordsWidth: beside ? sideWordsWidth : width
    // The wash takes the rest of the columns and the gap before them; the
    // words keep a gap of their own inside theirs.
    readonly property int deviceWidth: beside ? width - wordsWidth - Theme.columnGap : width
    readonly property real content: beside ? Math.max(words.implicitHeight, caption.y + caption.height) : words.implicitHeight + Theme.xl + caption.y + caption.height

    width: parent ? parent.width : 1280
    // Below it, the page's own gap between sections, as under any other.
    height: content + (beside ? 0 : Theme.l)

    Column {
        id: words
        y: hero.beside ? Theme.xl : 0
        width: hero.wordsWidth
        spacing: Theme.l

        // The eyebrow, a pill with the accent's dot.
        Rectangle {
            visible: hero.eyebrow !== ""
            width: pill.implicitWidth + Theme.m + 14
            height: 30
            radius: Theme.brackets ? 0 : 15
            fill: Theme.surfaceRaised
            border.color: Theme.divider
            border.width: 1

            Rectangle {
                x: Theme.s
                anchors.verticalCenter: parent.verticalCenter
                width: 6
                height: 6
                radius: 3
                fill: Theme.accent
            }
            Text {
                id: pill
                x: Theme.s + 6 + Theme.xs
                anchors.verticalCenter: parent.verticalCenter
                text: hero.eyebrow
                color: Theme.text
                font.family: Theme.sans
                font.size: Theme.captionSize
                font.weight: Font.Medium
            }
        }
        Heading {
            width: parent.width - (hero.roomy ? Theme.l : 0)
            level: "hero"
            wide: hero.wide
            text: hero.title
        }
        Text {
            width: Math.min(parent.width - (hero.roomy ? Theme.xl : 0), Theme.measure)
            format: Text.RichText
            text: Nav.linked(Content.base, hero.subtitle)
            color: Theme.textMuted
            linkColor: Theme.link
            font.family: Theme.sans
            font.size: hero.wide ? Theme.subtitleSize : Theme.bodySize
            lineHeightMode: Text.FixedHeight
            lineHeight: hero.wide ? Theme.subtitleLine : Theme.bodyLine
            wrap: Text.Wrap
            onLinkActivated: (link) => hero.followed(link)
        }
        Flow {
            id: actionRow
            width: parent.width
            spacing: Theme.s
            topPadding: Theme.xs
        }
    }

    // The demo, and what can be done with it.
    Item {
        id: deviceSide
        x: hero.beside ? hero.width - hero.deviceWidth : -hero.bleed
        y: hero.beside ? Theme.xs : words.implicitHeight + Theme.xl
        width: hero.deviceWidth + 2 * hero.bleed
        height: caption.y + caption.height

        // The wash the demo stands in: a soft field from the mark's
        // purple to its amber, the demo inset in it, so the live app
        // reads as the page's centre, not a card in a column. It keeps
        // to the grid's edge; a plain look's wash is transparent.
        Rectangle {
            id: wash
            readonly property int reach: hero.reach
            width: parent.width
            height: stageArea.height + 2 * reach
            radius: Theme.radiusLarge + reach / 2
            Accessible.ignored: true
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0; color: Theme.washStart }
                GradientStop { position: 1; color: Theme.washEnd }
            }
        }
        Column {
            id: stageArea
            x: wash.reach
            y: wash.reach
            width: hero.stageWidth
        }
        Text {
            id: caption
            // On the page's column, where the wash runs into the gutter.
            x: hero.bleeds ? hero.bleed : wash.reach
            y: wash.height + (hero.wide ? Theme.m : Theme.s)
            width: Math.min(parent.width - 2 * x, Theme.measure)
            visible: text !== ""
            text: hero.caption
            color: Theme.textMuted
            font.family: Theme.sans
            font.size: Theme.captionSize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.captionLine
            wrap: Text.Wrap
        }
    }
}
