import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Site
import "../nav.js" as Nav
import "logic/review.ts" as Review

// One framework of the review, in the words of someone who loves it:
// what it is, why they reach for it and what they would show first, then
// where it is not as strong, as plainly, and where to find it. Above
// the words, the app as the published repository pictured it, in the
// page's scheme, and what of the spec it could not do.
Column {
    id: section

    required property Review.Review review
    required property Review.Framework framework
    property bool wide: true
    // The page runs in a browser: what the build does not write (the
    // pictures) is made.
    property bool live: false
    property Flickable scroller

    // The picture's width: the measure, or the page's on a phone.
    readonly property int shot: Math.min(width, Theme.measure + Theme.xxl)

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
    // How this entry builds the app, where the framework has more than
    // one way, and the same framework's entry of the other kind.
    Text {
        visible: (section.framework.strategy ?? "") !== ""
        x: App.layoutDirection === Direction.RightToLeft ? parent.width - width : 0
        width: Math.min(parent.width, Theme.measure)
        text: section.framework.strategy ?? ""
        color: Theme.textMuted
        font.family: Theme.sans
        font.size: Theme.captionSize
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.captionLine
        wrap: Text.Wrap
    }
    Text {
        objectName: "reviewPair"
        visible: Review.pairOf(section.framework).length > 0
        width: parent.width
        text: section.framework.kind === "web" ? t`Also among the native apps: ${Review.pairNames(section.review, section.framework)}.` : t`Also among the web apps: ${Review.pairNames(section.review, section.framework)}.`
        color: Theme.textMuted
        font.family: Theme.sans
        font.size: Theme.captionSize
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.captionLine
        wrap: Text.Wrap
    }
    // The app as published, one picture for each scheme and only the
    // page's shown: lazy, so a reader fetches the pictures of the
    // sections they scroll to, from the repository's site, and the page
    // carries none. Made once the page runs, not by the build: the page
    // as written is made twice (wide and narrow), each picture with it,
    // and its first load has no room to spare (tests/payload.spec.js).
    // Both are made, the other hidden, so a change of scheme shows the
    // other at once, and one place holds both.
    Loader {
        active: section.live && section.framework.screenshot !== undefined
        visible: active
        width: section.shot
        height: Math.round(section.shot * 800 / 1280)
        component: Item {
            Text {
                objectName: "reviewShot"
                visible: !Theme.dark
                width: section.shot
                height: Math.round(section.shot * 800 / 1280)
                format: Text.RichText
                text: Review.shotOf(section.framework, false, section.shot)
            }
            Text {
                objectName: "reviewShot"
                visible: Theme.dark
                width: section.shot
                height: Math.round(section.shot * 800 / 1280)
                format: Text.RichText
                text: Review.shotOf(section.framework, true, section.shot)
            }
        }
    }
    Text {
        objectName: "reviewMissing"
        visible: Review.missingOf(section.framework).length > 0
        x: App.layoutDirection === Direction.RightToLeft ? parent.width - width : 0
        width: Math.min(parent.width, Theme.measure)
        text: t`What of the spec this entry does not do: ${Review.missingOf(section.framework).join("; ")}.`
        color: Theme.text
        font.family: Theme.sans
        font.size: Theme.captionSize + 1
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
        visible: section.framework.prose.cool.length > 0 || section.framework.prose.shows.length > 0
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
                    readonly property string href: Review.hrefOf(shown.modelData)
                    format: href !== "" ? Text.RichText : Text.PlainText
                    text: href !== "" ? Nav.anchor(href, `${shown.modelData.file}:${shown.modelData.lines}`, false, Theme.link) : `${shown.modelData.file}:${shown.modelData.lines}`
                    color: href !== "" ? Theme.link : Theme.textMuted
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
                code: Review.codeOf(shown.modelData)
                rich: shown.modelData.rich
            }
        }
    }

    Item {
        width: 1
        height: Theme.xxs
    }
    Text {
        visible: section.framework.prose.limits.length > 0
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
        // A web build runs as measured, from the repository's site. Made
        // only where there is one: a hidden button would still be on every
        // native section of the first load's page.
        Loader {
            active: (section.framework.run ?? "") !== ""
            visible: active
            component: LinkButton {
                objectName: "reviewRun"
                label: t`Run ${section.framework.name} in your browser`
                href: section.framework.run ?? ""
            }
        }
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
