import QtQuick
import Ljos.Blocks

// The app's "status" place, as a block a shell can put anywhere:
// the basket contributes its status line here by name, without
// either of them holding the other. Move this block in a shell
// and the status line moves with it.
Item {
    width: 280
    height: 24

    // No delegate of its own: a Slot shows its own beside the
    // contributions, and this place is only for what the app
    // contributes to it — empty until something does.
    Slot {
        name: "status"
    }
}
