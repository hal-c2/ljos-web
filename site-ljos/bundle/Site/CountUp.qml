import Ljos.Ui
import Ljos.Core
import Site
import "../nav.js" as Nav
import "logic/place.ts" as Place

// A measured number that counts up to itself once, the first time the
// reader scrolls to it. It is said, and stands in the build, with reduced
// motion and where no script runs, as its final value; only a number
// below the first screen when the page comes to life counts, so nothing
// the reader already sees changes under them.
Text {
    id: number

    property real to: 0
    property int decimals: 0
    property string prefix: ""
    property string suffix: ""
    property bool armed: false
    property bool seen: false
    property real value: armed && !seen ? 0 : to
    readonly property string final: prefix + to.toFixed(decimals) + suffix

    text: prefix + value.toFixed(decimals) + suffix
    Accessible.name: final
    color: Theme.onCanvasStrong
    font.family: Theme.display
    font.weight: Theme.displayWeight
    font.size: Theme.displaySize
    font.letterSpacing: Theme.displayTracking * Theme.displaySize / Theme.heroSize
    font.features: { "tnum": 1 }
    lineHeightMode: Text.FixedHeight
    lineHeight: Theme.displayLine

    Behavior on value {
        enabled: number.seen && !Theme.calm
        NumberAnimation {
            duration: 900
            easing.type: Easing.OutCubic
        }
    }

    function look(): void {
        if (!armed || seen)
            return;
        const top = Place.topOf(number.mapToItem(undefined, 0, 0));
        if (top + number.height < Running.viewBottom && top > Running.viewTop)
            seen = true;
    }
    Component.onCompleted: {
        if (!Nav.inBrowser() || Theme.calm)
            return;
        later(() => {
            const top = Place.topOf(number.mapToItem(undefined, 0, 0));
            armed = Running.viewBottom > 0 && top >= Running.viewBottom;
        });
    }
    Connections {
        target: Running
        enabled: number.armed && !number.seen
        function onMoved() {
            number.look();
        }
    }
}
