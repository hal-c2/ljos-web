import Ljos.Ui
import "logic/after/board.ts" as Board

// The dispatch app once board.ts is edited, built from
// logic/after/board.ts: two lanes.
DispatchCard {
    layout: "board"
    lay: Board.lanes
}
