import Ljos.Ui
import Ljos.Core
import "../nav.js" as Nav
import "../desktop.js" as Desktop

// The desktop's own back, forward and reading (desktop.js), handed to
// nav.js. Main.qml makes this only on the desktop, by its address
// (Site/later.js), so no browser's first load holds it.
Item {
    Component.onCompleted: Nav.useDesktop(Desktop.navigation())
}
