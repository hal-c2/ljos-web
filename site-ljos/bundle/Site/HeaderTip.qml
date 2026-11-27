pragma Scripts: JavaScript
import Ljos.Ui
import Ljos.Core
import Site

// What a control of the header does and how it stands, in a tip under
// it: shown a moment after a pointer comes to rest on the control, as a
// browser's own tip is, and at once when the keyboard reaches it. It
// stays while the pointer moves onto it, goes when the pointer and the
// keyboard have left or Escape is pressed (`dismiss`), and is kept inside
// the window: under the control, or over it where there is no room under
// (WCAG 1.4.13). A screen reader hears the same words as the control's
// description, so the tip itself is not read.
//
// It is the control's child: `hovered` is whether the pointer is on the
// control, and `quiet` holds it back (while the control's own popover is
// open, say).
Rectangle {
    id: tip

    property string text: ""
    property bool hovered: false
    property bool quiet: false
    readonly property Item control: parent
    readonly property bool focused: control ? control.activeFocus : false
    readonly property bool over: hovered || on.hovered
    // Escape hides it until the pointer and the keyboard have both left.
    property bool dismissed: false
    readonly property bool wanted: (over || focused) && !dismissed && !quiet && text !== ""
    property bool shown: false
    // Where it starts across, from the control's left: under its middle,
    // as far in as the window's edge leaves room for.
    property real across: 0
    // Over the control instead, when the window has no room under it (a
    // control at the window's foot, in a shell's popover).
    property bool above: false

    // True when it was showing: the key was for it.
    function dismiss() {
        if (!shown)
            return false;
        dismissed = true;
        return true;
    }
    function place() {
        if (!control)
            return;
        let root = control;
        while (root.parent)
            root = root.parent;
        const at = control.mapToItem(root, 0, 0);
        const centred = (control.width - width) / 2;
        const edge = Theme.xs;
        across = Math.max(edge - at.x, Math.min(centred, root.width - edge - at.x - width));
        above = at.y + control.height + Theme.xxs + height + edge > root.height;
    }

    onWantedChanged: {
        if (!wanted) {
            wait.stop();
            // A pointer crossing the gap to the tip finds it still there.
            if (shown && !dismissed && !quiet && !focused)
                linger.restart();
            else
                shown = false;
        } else if (focused) {
            linger.stop();
            place();
            shown = true;
        } else if (shown) {
            linger.stop();
        } else {
            wait.restart();
        }
    }
    onOverChanged: if (!over && !focused) dismissed = false
    onFocusedChanged: if (!over && !focused) dismissed = false
    onWidthChanged: if (shown) place()

    Timer {
        id: wait
        // About as long as a browser waits before its own tip.
        interval: 600
        onTriggered: {
            tip.place();
            tip.shown = tip.wanted;
        }
    }
    Timer {
        id: linger
        interval: 150
        onTriggered: tip.shown = tip.wanted
    }

    visible: shown
    z: 100
    x: across
    y: !control ? 0 : above ? -height - Theme.xxs : control.height + Theme.xxs
    width: words.implicitWidth + 2 * Theme.xs
    height: words.implicitHeight + Theme.xs
    radius: Theme.radiusSmall
    fill: Theme.surfaceRaised
    border.width: 1
    border.color: Theme.border
    Accessible.ignored: true

    Hover {
        id: on
    }
    Text {
        id: words
        anchors.centerIn: parent
        // Its words only while it is shown: a prerendered page's light and
        // dark renders are one where only their colours differ, and the
        // theme's tip says the theme.
        text: tip.shown ? tip.text : ""
        color: Theme.text
        font.family: Theme.sans
        font.size: Theme.captionSize
        Accessible.ignored: true
    }
}
