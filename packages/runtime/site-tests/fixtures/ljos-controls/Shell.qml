import QtQuick
import Ljos.Controls
import Ljos.Controls.Basic as Basic
import Ljos.Design

// Ljós's own controls and the design they are drawn with, which ljos-web
// holds: a button and a card in Ljós's look, a control Ljós has no look of
// yet in Basic's, the Basic twin of a control, and the design's spacing.
Column {
    spacing: Spacing.md
    property int clicks: 0

    Card {
        Button { id: go; text: "Go"; onClicked: clicks++ }
    }
    ProgressBar { id: progress; value: 0.5 }
    Basic.Button { id: plain; text: "Plain" }
    Text { text: "spacing " + Spacing.md + " fits " + (go.height === Theme.controlHeight) + " bar " + (progress.width > 0) }
    Text { text: "clicked " + clicks }
}
