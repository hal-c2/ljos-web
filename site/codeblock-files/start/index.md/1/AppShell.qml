import Ljos.Ui
import Ljos.Layout
import Ljos.Blocks

Column {
    spacing: 8

    Row {
        spacing: 4
        Slot {
            name: "toolbar"
        }
    }

    Slot {
        name: "status"
    }
}
