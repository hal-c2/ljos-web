import Ljos.Ui
import QtQuick.Controls

// Never shown: naming it makes this page one built with Qt Quick
// Controls (Ljós's own styles), so the compiler in the page can be
// given them for a reader's edits (docs/LJOS_WEB.md A15) — as the
// Astro site's own ControlsHost does for its islands. A Label, the
// least of them: what it names is in every page's first load, and a
// Button's file is cut with the popups' (tests/payload.spec.js).
Item {
    Label {
        text: "host"
    }
}
