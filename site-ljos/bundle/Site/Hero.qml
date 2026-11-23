// Ljós's Core before QtQuick: only its t`` is wanted here.
import Ljos.Core
import QtQuick
import Site
import "../nav.js" as Nav

// The front page's first screen: what Ljós is, on the left, and a live
// app running in a framed device on the right (HeroStage), both from
// the same top; on a phone the device follows the words.
// The words and the calls to act are the page's (Landing), the frame
// and how they stand the shell's.
Item {
    id: hero

    property string eyebrow: ""
    property string title: ""
    property string subtitle: ""
    property bool wide: true
    // The calls to act, a row of LinkButtons.
    default property alias actions: actionRow.data
    signal followed(string link)

    readonly property real column: (width - (Theme.columns - 1) * Theme.columnGap) / Theme.columns
    readonly property int wordsWidth: wide ? Math.round(6 * column + 5 * Theme.columnGap) : width
    // The wash takes the last six columns and the gap before them; the
    // words keep a gap of their own inside theirs.
    readonly property int deviceWidth: wide ? Math.round(6 * column + 5 * Theme.columnGap) : width
    readonly property real content: wide ? Math.max(words.implicitHeight, caption.y + caption.height) : words.implicitHeight + Theme.xl + caption.y + caption.height

    width: parent ? parent.width : 1280
    // Below it, the page's own gap between sections, as under any other.
    height: content + (wide ? 0 : Theme.l)

    Column {
        id: words
        y: hero.wide ? Theme.xl : 0
        width: hero.wordsWidth
        spacing: Theme.l

        // The eyebrow, a pill with the accent's dot.
        Rectangle {
            visible: hero.eyebrow !== ""
            width: pill.implicitWidth + Theme.m + 14
            height: 30
            radius: 15
            color: Theme.surfaceRaised
            border.color: Theme.divider
            border.width: 1

            Rectangle {
                x: Theme.s
                anchors.verticalCenter: parent.verticalCenter
                width: 6
                height: 6
                radius: 3
                color: Theme.accent
            }
            Text {
                id: pill
                x: Theme.s + 6 + Theme.xs
                anchors.verticalCenter: parent.verticalCenter
                text: hero.eyebrow
                color: Theme.text
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
                font.weight: Font.Medium
            }
        }
        Heading {
            width: Math.min(parent.width, hero.wide ? parent.width - Theme.l : parent.width)
            level: "hero"
            wide: hero.wide
            text: hero.title
        }
        Text {
            width: Math.min(parent.width - (hero.wide ? Theme.xl : 0), Theme.measure)
            textFormat: Text.RichText
            text: Nav.linked(Content.base, hero.subtitle)
            color: Theme.textMuted
            linkColor: Theme.link
            font.family: Theme.sans
            font.pixelSize: hero.wide ? Theme.subtitleSize : Theme.bodySize
            lineHeightMode: Text.FixedHeight
            lineHeight: hero.wide ? Theme.subtitleLine : Theme.bodyLine
            wrapMode: Text.Wrap
            onLinkActivated: (link) => hero.followed(link)
        }
        Flow {
            id: actionRow
            width: parent.width
            spacing: Theme.s
            topPadding: Theme.xs
        }
    }

    // The device, and what can be done with it.
    Item {
        id: deviceSide
        x: hero.wide ? hero.width - hero.deviceWidth : 0
        y: hero.wide ? Theme.xs : words.implicitHeight + Theme.xl
        width: hero.deviceWidth
        height: caption.y + caption.height

        // The wash the device stands in: a soft field from the mark's
        // purple to its amber, the device inset in it, so the live app
        // reads as the page's centre, not a card in a column. It keeps
        // to the grid's edge; a plain look's wash is transparent.
        Rectangle {
            id: wash
            readonly property int reach: hero.wide ? Theme.xl : Theme.s
            width: parent.width
            height: device.height + 2 * reach
            radius: Theme.radiusLarge + reach / 2
            Accessible.ignored: true
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0; color: Theme.washStart }
                GradientStop { position: 1; color: Theme.washEnd }
            }
        }
        HeroStage {
            id: device
            x: wash.reach
            y: wash.reach
            width: parent.width - 2 * wash.reach
        }
        Text {
            id: caption
            x: wash.reach
            y: wash.height + (hero.wide ? Theme.m : Theme.s)
            width: Math.min(parent.width - 2 * wash.reach, Theme.measure)
            text: t`Read the source, inspect any live property in Observer, or step the recorded agent trace while the app keeps running.`
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.captionLine
            wrapMode: Text.Wrap
        }
    }
}
