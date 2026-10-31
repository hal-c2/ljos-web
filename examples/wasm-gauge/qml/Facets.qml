import QtQuick
import Example.Facets

Item {
    id: root
    property alias shelf: shelf
    property int right: Shelf.Right
    property int started: Store.start
    property int doubled: shelf.limits.max * 2
    property int tallies: 0
    property int seenLevel: shelf.level

    Shelf.weight: 3
    Shelf.onTallied: root.tallies = root.tallies + 1

    Shelf {
        id: shelf
        level: 5
        limits.max: 9
    }

    function bumpStore() {
        Store.start = Store.start + 1
    }
}
