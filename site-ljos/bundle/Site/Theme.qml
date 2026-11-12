pragma Singleton
import QtQuick

// The site's colours, in one place, following the reader's own
// light/dark choice in the header. Warm paper and amber, as the
// Astro site's brand sheet has them; a page prerendered for a reader
// with no script is the light one.
QtObject {
    property bool dark: false

    readonly property color bg: dark ? "#1a1712" : "#fdfbf6"
    readonly property color panel: dark ? "#241f19" : "#f6f1e6"
    readonly property color codeBg: dark ? "#221d17" : "#f3edde"
    readonly property color ink: dark ? "#ece5d8" : "#2b251d"
    readonly property color muted: dark ? "#b3a892" : "#6b5f4c"
    readonly property color accent: dark ? "#e0a43c" : "#9a6210"
    readonly property color border: dark ? "#453a2d" : "#ddd2bd"
    readonly property color onAccent: dark ? "#1a1712" : "#ffffff"

    readonly property string serif: "Georgia"
    readonly property string sans: "system-ui"
    readonly property string mono: "monospace"
}
