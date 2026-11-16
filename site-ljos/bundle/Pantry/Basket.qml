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
    color: look.basket

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

    // The colours this app draws with, for the scheme the reader chose:
    // each the dark it was drawn in or a light that keeps the text on it
    // as readable.
    QtObject {
        id: look
        readonly property bool dark: Application.styleHints.colorScheme === Qt.ColorScheme.Dark
        readonly property color basket: dark ? "#2a2118" : "#fbf1de"
        readonly property color basketMuted: dark ? "#d8c39a" : "#6b5a3a"
        readonly property color basketStatus: dark ? "#f3c97e" : "#7a4c00"
        readonly property color ink: dark ? "#f5eeda" : "#1b1f2a"
    }

    Contribution {
        slot: "status"
        delegate: Component {
            Text {
                objectName: "statusText"
                color: look.basketStatus
                font.pixelSize: 14
                text: basket.summary
            }
        }
    }

    Text {
        objectName: "basketText"
        x: 14
        y: 10
        color: look.ink
        font.pixelSize: 18
        text: qsTr("Basket")
    }
    Text {
        objectName: "basketSummary"
        x: 14
        y: 36
        color: look.basketMuted
        font.pixelSize: 14
        text: basket.summary
    }
}
