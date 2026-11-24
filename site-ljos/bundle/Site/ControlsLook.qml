import Ljos.Ui
import Ljos.Core
import Site
import Ljos.Controls as C

// The colours Ljós's own controls draw in are the site's. Made once the
// site first shows one of them (Main.qml), so it comes with them.
Item {
    visible: false

    Binding { target: C.Theme; property: "canvas"; value: Theme.canvas }
    Binding { target: C.Theme; property: "text"; value: Theme.text }
    Binding { target: C.Theme; property: "accent"; value: Theme.accent }
}
