import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Site
import "../nav.js" as Nav
import "logic/review.ts" as Review

// One framework of the review, in the words of someone who loves it:
// what it is, why they reach for it and what they would show first, then
// where it is not as strong, as plainly, and where to find it.
Column {
    id: section

    required property Review.Framework framework
    property bool wide: true
    property Flickable scroller

    spacing: Theme.s
    Accessible.role: Accessible.Section
    // Not the name alone: the shell's own region is already "Ljós".
    Accessible.name: t`${section.framework.name}, by a fan`

    Text {
        width: parent.width
        text: section.framework.name
        color: Theme.text
        font.family: Theme.sans
        font.size: section.wide ? Theme.headlineSize - 2 : Theme.headlineSize - 6
        font.weight: Font.Bold
        lineHeightMode: Text.FixedHeight
        lineHeight: section.wide ? Theme.headlineLine - 4 : Theme.headlineLine - 8
        wrap: Text.Wrap
        readonly property int headingLevel: 3
        Accessible.role: Accessible.Heading
    }
    Text {
        width: parent.width
        text: [section.framework.version, section.framework.licence, section.framework.language].join(" · ")
        color: Theme.textMuted
        font.family: Theme.sans
        font.size: Theme.captionSize
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.captionLine
        wrap: Text.Wrap
    }
    Text {
        x: App.layoutDirection === Direction.RightToLeft ? parent.width - width : 0
        width: Math.min(parent.width, Theme.measure)
        text: section.framework.prose.fan
        color: Theme.text
        font.family: Theme.sans
        font.size: Theme.bodySize
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.bodyLine
        wrap: Text.Wrap
    }

    Item {
        width: 1
        height: Theme.xxs
    }
    Text {
        width: parent.width
        text: t`What a fan shows first`
        color: Theme.text
        font.family: Theme.sans
        font.size: Theme.bodySize
        font.weight: Font.DemiBold
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.bodyLine
        readonly property int headingLevel: 4
        Accessible.role: Accessible.Heading
    }
    Column {
        width: Math.min(parent.width, Theme.measure)
        spacing: Theme.xxs
        Accessible.role: Accessible.List
        Repeater {
            model: section.framework.prose.cool
            Text {
                required property string modelData
                width: parent.width
                leftPadding: Theme.m
                text: modelData
                color: Theme.text
                font.family: Theme.sans
                font.size: Theme.bodySize - 1
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.bodyLine - 2
                wrap: Text.Wrap
                Accessible.role: Accessible.ListItem
                Accessible.name: modelData
                Rectangle {
                    x: Theme.xxs
                    y: Math.round((Theme.bodyLine - 2) / 2) - 3
                    width: 6
                    height: 6
                    radius: 3
                    fill: Theme.accent
                }
            }
        }
    }

    // The inbox code the fan would show first: what it shows, its file
    // and lines (linked where the app is published), then the code.
    Repeater {
        model: section.framework.prose.shows
        Column {
            id: shown
            required property Review.Excerpt modelData
            width: Math.min(parent.width, Theme.measure + Theme.xxl)
            spacing: Theme.xs
            topPadding: Theme.xs

            Flow {
                width: parent.width
                spacing: Theme.s
                Text {
                    text: shown.modelData.caption ?? ""
                    color: Theme.text
                    font.family: Theme.sans
                    font.size: Theme.bodySize - 1
                    font.italic: true
                    wrap: Text.Wrap
                    width: Math.min(implicitWidth, parent.width)
                }
                Text {
                    topPadding: 2
                    format: shown.modelData.href ? Text.RichText : Text.PlainText
                    text: shown.modelData.href ? Nav.anchor(shown.modelData.href, `${shown.modelData.file}:${shown.modelData.lines}`, false, Theme.link) : `${shown.modelData.file}:${shown.modelData.lines}`
                    color: shown.modelData.href ? Theme.link : Theme.textMuted
                    linkColor: Theme.link
                    font.family: Theme.mono
                    font.size: Theme.captionSize
                    onLinkActivated: (to) => Nav.go(to)
                }
            }
            CodeBlock {
                width: parent.width
                scroller: section.scroller
                lang: shown.modelData.lang
                code: shown.modelData.code
                rich: shown.modelData.rich
            }
        }
    }

    Item {
        width: 1
        height: Theme.xxs
    }
    Text {
        width: parent.width
        text: t`Where it is not as strong`
        color: Theme.text
        font.family: Theme.sans
        font.size: Theme.bodySize
        font.weight: Font.DemiBold
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.bodyLine
        readonly property int headingLevel: 4
        Accessible.role: Accessible.Heading
    }
    Column {
        width: Math.min(parent.width, Theme.measure)
        spacing: Theme.xxs
        Accessible.role: Accessible.List
        Repeater {
            model: section.framework.prose.limits
            Text {
                required property string modelData
                width: parent.width
                leftPadding: Theme.m
                text: modelData
                color: Theme.text
                font.family: Theme.sans
                font.size: Theme.bodySize - 1
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.bodyLine - 2
                wrap: Text.Wrap
                Accessible.role: Accessible.ListItem
                Accessible.name: modelData
                Rectangle {
                    x: Theme.xxs
                    y: Math.round((Theme.bodyLine - 2) / 2) - 1
                    width: 6
                    height: 2
                    fill: Theme.textMuted
                }
            }
        }
    }

    Flow {
        width: parent.width
        spacing: Theme.xs
        LinkButton {
            quiet: true
            label: t`${section.framework.name} website`
            href: section.framework.links.site
        }
        LinkButton {
            quiet: true
            label: t`${section.framework.name} docs`
            href: section.framework.links.docs
        }
        LinkButton {
            quiet: true
            label: t`${section.framework.name} repository`
            href: section.framework.links.repo
        }
    }
}
