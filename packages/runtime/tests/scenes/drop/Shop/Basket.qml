import QtQuick

// A block: its state is what is read-only, its actions its functions, its
// events its signals. It keeps its state whichever shell shows it.
Rectangle {
    id: basket
    width: 120
    height: 40
    color: "#eeeeee"
    property int bought: 0
    readonly property int count: bought
    readonly property url cover: "cover.svg"
    readonly property var items: ["tea", "bread"]
    signal added(int count)
    function add() {
        bought = bought + 1
        added(bought)
    }
    Text {
        objectName: "basketText"
        text: "Basket " + basket.count
    }
}
