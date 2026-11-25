import Ljos.Ui
import Ljos.Blocks

// A named slot a shell can place anywhere. Basket contributes its status line
// to "status" by name, so neither block holds a reference to the other.
// Try moving StatusSlot in Shell.qml: the status line moves with it.
Item {
    width: 280
    height: 24

    // Left without a fallback delegate so the slot stays empty until a block
    // contributes to "status".
    Slot {
        name: "status"
    }
}
