import QtQuick
import Ljos.Blocks

// The basket block: the app's own data, which no shell owns. Its
// state is read-only (`count`, `total`, the per-good counts and
// prices), its actions are its functions, and `added` is its event.
// Whichever shell is showing, there is one basket for the page, so
// what was bought survives every rewrite of the interface around it.
// It also contributes the app's status line to the "status" slot:
// whichever shell places a StatusSlot shows it there.
Rectangle {
    id: basket
    width: 300
    height: 64
    radius: 8
    color: "#2a2118"

    property int teaBought: 0
    property int breadBought: 0
    property int jamBought: 0

    readonly property int count: teaBought + breadBought + jamBought
    readonly property real total: teaBought * teaPrice + breadBought * breadPrice + jamBought * jamPrice
    readonly property int teaCount: teaBought
    readonly property int breadCount: breadBought
    readonly property int jamCount: jamBought
    readonly property real teaPrice: 3.5
    readonly property real breadPrice: 2.25
    readonly property real jamPrice: 4.0
    readonly property string summary: count + " in the basket · £" + total.toFixed(2)

    signal added(int count)

    function addTea() {
        teaBought = teaBought + 1;
        added(count);
    }
    function addBread() {
        breadBought = breadBought + 1;
        added(count);
    }
    function addJam() {
        jamBought = jamBought + 1;
        added(count);
    }
    function emptyBasket() {
        teaBought = 0;
        breadBought = 0;
        jamBought = 0;
        added(count);
    }

    Contribution {
        slot: "status"
        delegate: Component {
            Text {
                objectName: "statusText"
                color: "#f3c97e"
                font.pixelSize: 14
                text: basket.summary
            }
        }
    }

    Text {
        objectName: "basketText"
        x: 14
        y: 10
        color: "#f5eeda"
        font.pixelSize: 18
        text: qsTr("Basket")
    }
    Text {
        objectName: "basketSummary"
        x: 14
        y: 36
        color: "#d8c39a"
        font.pixelSize: 14
        text: basket.summary
    }
}
