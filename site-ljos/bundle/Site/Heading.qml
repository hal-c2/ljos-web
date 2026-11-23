import QtQuick
import Site

// A page's or a section's headline, in the shell's own voice: the
// display face for the big steps (hero, display), the sans for the
// smaller (headline, title), at the step's size wide or on a phone, with
// the look's tracking and case. A heading, at the level its step gives
// unless it is told one.
Text {
    id: heading

    // "hero", "display", "headline" or "title".
    property string level: "headline"
    property bool wide: true
    property int headingLevel: level === "hero" ? 1 : level === "title" ? 3 : 2

    readonly property bool big: level === "hero" || level === "display"
    readonly property int size: level === "hero" ? (wide ? Theme.heroSize : Theme.compactHeroSize) : level === "display" ? (wide ? Theme.displaySize : Theme.compactDisplaySize) : level === "headline" ? (wide ? Theme.headlineSize : Theme.titleSize + 3) : Theme.titleSize
    readonly property int line: level === "hero" ? (wide ? Theme.heroLine : Theme.compactHeroLine) : level === "display" ? (wide ? Theme.displayLine : Theme.compactDisplayLine) : level === "headline" ? (wide ? Theme.headlineLine : Theme.titleLine + 3) : Theme.titleLine

    color: Theme.onCanvasStrong
    font.family: big ? Theme.display : Theme.sans
    font.pixelSize: size
    font.weight: big ? Theme.displayWeight : Font.DemiBold
    font.capitalization: big && Theme.displayUpper ? Font.AllUppercase : Font.MixedCase
    // Tracking is the look's at the hero's size, in proportion below it;
    // the sans steps sit a little tight, as large text does.
    font.letterSpacing: big ? Theme.displayTracking * size / Theme.heroSize : -0.01 * size
    lineHeightMode: Text.FixedHeight
    lineHeight: line
    wrapMode: Text.Wrap
    Accessible.role: Accessible.Heading
}
