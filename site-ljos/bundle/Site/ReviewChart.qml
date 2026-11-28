import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Site
import "logic/review.ts" as Review

// One metric of the framework review as a bar chart: a bar for each
// picked framework it has a number of, the median as the bar's length,
// the spread of the runs as a whisker across its end and the number at
// its tip. One measure on one axis, in the accent alone, as each bar
// names its framework; the command that measured it under the bars.
//
// Native and web apps measured differently (a browser's whole process
// tree against an app's own, a first contentful paint against a first
// frame) are two groups, each on a scale of its own with its own how
// and command, so no bar is read against one it does not compare with.
//
// The model is the picked frameworks' ids, so a framework that stays
// picked keeps its bar, and only a newly picked one comes in: it grows
// to its length as it fades in, or with reduced motion only fades in
// (an animation of Ljós's API puts what grows at its end at once and
// fades what fades). The bars there as the page comes to life stand
// where the build drew them.
Column {
    id: chart

    required property Review.Review review
    required property Review.Metric metric
    required property list<string> picked
    // The page is running in a browser: a bar picked from here on eases
    // in. False as the page is built and while it is taken over.
    property bool live: false
    property bool wide: true

    spacing: Theme.xs
    Accessible.role: Accessible.Section
    Accessible.name: chart.metric.label

    readonly property list<string> missing: Review.unmeasured(chart.review, chart.metric, chart.picked)
    readonly property string only: Review.onlyKind(chart.metric)
    readonly property bool split: chart.metric.groups.length > 1
    readonly property int held: Review.groupsHeld(chart.review, chart.metric, chart.picked)
    // The names' column and the room after the longest bar for its number.
    readonly property real names: chart.wide ? 104 : 84
    readonly property real tip: 76

    Text {
        width: parent.width
        text: chart.metric.label
        color: Theme.text
        font.family: Theme.sans
        font.size: Theme.bodySize
        font.weight: Font.DemiBold
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.bodyLine
        wrap: Text.Wrap
        readonly property int headingLevel: 3
        Accessible.role: Accessible.Heading
    }
    Text {
        visible: chart.split && chart.held > 1
        width: parent.width
        text: t`Native and web apps are measured differently here, so each has a scale of its own: compare within a group, not across.`
        color: Theme.textMuted
        font.family: Theme.sans
        font.size: Theme.captionSize
        font.italic: true
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.captionLine
        wrap: Text.Wrap
    }

    Repeater {
        model: chart.metric.groups
        Column {
            id: group

            required property Review.Group modelData
            readonly property list<Review.Bar> bars: Review.barsIn(chart.review, chart.metric, group.modelData, chart.picked)
            readonly property list<string> shown: group.bars.map((bar) => bar.id)
            readonly property real reach: Review.reach(group.bars, chart.metric.floor ?? 0)

            // A kind's group with none of its kind picked would be a
            // method and a command over no bars: it comes in with the
            // first one picked.
            visible: !chart.split || group.bars.length > 0
            width: parent.width
            topPadding: chart.split ? Theme.xs : 0
            spacing: Theme.xs

            Text {
                visible: chart.split
                width: parent.width
                text: group.modelData.kind === "web" ? t`Web apps` : t`Native apps`
                color: Theme.text
                font.family: Theme.sans
                font.size: Theme.captionSize + 1
                font.weight: Font.DemiBold
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.captionLine
                readonly property int headingLevel: 4
                Accessible.role: Accessible.Heading
            }
            Text {
                width: parent.width
                text: group.modelData.how
                color: Theme.textMuted
                font.family: Theme.sans
                font.size: Theme.captionSize
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.captionLine
                wrap: Text.Wrap
            }

            Column {
                width: parent.width
                topPadding: Theme.xs
                bottomPadding: Theme.xs
                spacing: 6
                Accessible.role: Accessible.List
                Accessible.name: Review.groupName(chart.metric, group.modelData)

                Repeater {
                    model: group.shown
                    Item {
                        id: item
                        objectName: "reviewItem"

                        required property string modelData
                        readonly property Review.Value value: chart.metric.values[item.modelData]
                        readonly property string name: Review.nameOf(chart.review, item.modelData)
                        readonly property real track: Math.max(0, width - chart.names - chart.tip)
                        // How far it has grown and faded in: 1 for a bar there from
                        // the start; a bar picked later starts at 0 and eases to 1.
                        property real grow: 1
                        property real seen: 1
                        property bool easing: false

                        width: parent.width
                        height: 24
                        opacity: item.seen
                        Accessible.role: Accessible.ListItem
                        Accessible.name: Review.barName({ id: item.modelData, name: item.name, value: item.value }, chart.metric.unit)

                        Component.onCompleted: {
                            if (!chart.live)
                                return;
                            // With less motion it stands at its length from its
                            // first frame and only fades in.
                            if (!Theme.calm)
                                item.grow = 0;
                            item.seen = 0;
                            later(() => {
                                item.easing = true;
                                item.grow = 1;
                                item.seen = 1;
                            });
                        }
                        Behavior on grow {
                            enabled: item.easing
                            NumberAnimation {
                                duration: Theme.enterSection
                                easing.type: Easing.OutQuart
                            }
                        }
                        // On opacity itself: with reduced motion only a fade of
                        // opacity still runs.
                        Behavior on opacity {
                            enabled: item.easing
                            NumberAnimation {
                                duration: Theme.enterPanel
                                easing.type: Easing.OutCubic
                            }
                        }

                        Text {
                            width: chart.names - Theme.s
                            anchors.verticalCenter: parent.verticalCenter
                            text: item.name
                            color: Theme.text
                            font.family: Theme.sans
                            font.size: Theme.captionSize + 1
                            elide: Text.ElideRight
                            Accessible.ignored: true
                        }
                        // The baseline every bar starts from.
                        Rectangle {
                            x: chart.names
                            width: 1
                            height: parent.height
                            fill: Theme.border
                        }
                        // The bar: rounded at its data end only, square on the
                        // baseline.
                        Rectangle {
                            id: bar
                            objectName: "reviewBar"
                            x: chart.names
                            anchors.verticalCenter: parent.verticalCenter
                            width: Math.max(2, item.track * item.value.median / group.reach * item.grow)
                            height: 16
                            radius: 4
                            fill: Theme.accent
                            Rectangle {
                                width: Math.min(4, parent.width)
                                height: parent.height
                                fill: Theme.accent
                            }
                        }
                        // The spread of the runs: a whisker from the least to the
                        // most, at the bar's end.
                        Rectangle {
                            objectName: "reviewSpread"
                            x: chart.names + item.track * item.value.min / group.reach * item.grow
                            anchors.verticalCenter: parent.verticalCenter
                            width: Math.max(1, item.track * (item.value.max - item.value.min) / group.reach * item.grow)
                            height: 2
                            fill: Theme.text
                            opacity: 0.6
                        }
                        Text {
                            x: chart.names + item.track * item.value.max / group.reach * item.grow + Theme.xs
                            anchors.verticalCenter: parent.verticalCenter
                            text: Review.said(item.value.median, chart.metric.unit)
                            color: Theme.text
                            font.family: Theme.sans
                            font.size: Theme.captionSize
                            font.features: { "tnum": 1 }
                            Accessible.ignored: true
                        }
                    }
                }
            }

            Text {
                width: parent.width
                text: t`Measured with`
                color: Theme.textMuted
                font.family: Theme.sans
                font.size: Theme.captionSize
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.captionLine
            }
            Text {
                width: parent.width
                text: group.modelData.command
                color: Theme.codeFg
                font.family: Theme.mono
                font.size: Theme.captionSize
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.captionLine
                // Between words first, so a command stays one search
                // away; a path wider than the window still breaks.
                wrap: Text.Wrap
            }
        }
    }

    Text {
        visible: chart.missing.length > 0
        width: parent.width
        text: chart.only === "native" ? t`No bar for ${chart.missing.join(", ")}: this is measured for native apps only.` : chart.only === "web" ? t`No bar for ${chart.missing.join(", ")}: this is measured for web apps only.` : t`No number yet for ${chart.missing.join(", ")}.`
        color: Theme.textMuted
        font.family: Theme.sans
        font.size: Theme.captionSize
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.captionLine
        wrap: Text.Wrap
    }
}
