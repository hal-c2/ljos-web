// A Controller declared in a Window acts on the window; a Tap, which needs
// an element to listen on, on the window's content item.
import Ljos.Ui
import Ljos.Core

Window {
    id: root
    width: 200
    height: 100
    visible: true
    property int taps: 0
    property bool onWindow: false
    property alias controller: controller
    property alias tap: tap

    Controller {
        id: controller
        onAttached: (host) => root.onWindow = host === root
    }
    Tap {
        id: tap
        onTapped: root.taps = root.taps + 1
    }
}
