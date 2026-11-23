import QtQuick
import "logic/before/board.ts" as Board

// The dispatch app as it starts, built from logic/before/board.ts: one list.
DispatchCard {
    layout: "list"
    lay: Board.lanes
}
