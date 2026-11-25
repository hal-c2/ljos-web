import Ljos.Ui
import Ljos.Core
import "host.js" as Host

// ljos.dev on the desktop (`mise run site:native`): the site as Main.qml
// is in a browser, with what a browser would give it instead. Ljós draws
// it all; the shell is taken by its address, as Ljós on the desktop
// takes one; and back and forward are the desktop's own (host.native.js
// `step`). No browser loads this file: what is here is in no page's load
// (tests/payload.spec.js).
Item {
    Main {
        // The keys nothing else takes come here (back and forward, `/`):
        // a click on a link gives nothing the focus there.
        focus: true
        renderer: "Ljós"
        elegant: url("Shells/Elegant.qml")
        observerDockSource: url("Site/ObserverDock.qml")
    }

    // What the site's own keys leave (Main.qml takes `/` and Escape).
    Keys.onPressed: (event: KeyEvent) => {
        const alt = (event.modifiers & Modifier.Alt) !== 0;
        const by = event.key === Key.Back || (alt && event.key === Key.Left) ? -1
            : event.key === Key.Forward || (alt && event.key === Key.Right) ? 1 : 0;
        if (by !== 0 && Host.desktop !== undefined && Host.desktop.step(by))
            event.accepted = true;
    }
}
