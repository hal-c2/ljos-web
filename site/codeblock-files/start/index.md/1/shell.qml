import Ljos.Ui
import Ljos.Layout
import Ljos.Blocks

Column {
    spacing: 12

    Slot {
        name: "status"
    }

    Row {
        spacing: 4
        Slot {
            name: "toolbar"
        }
    }
}
