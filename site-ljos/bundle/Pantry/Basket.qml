import Ljos.Ui
import Ljos.Core
import Ljos.Blocks

// The basket block owns the app's state, actions, and status contribution.
// Because no shell owns this block, rewriting Shell.qml keeps everything
// already in the basket. Try changing a price below or calling emptyBasket()
// from a button in Shell.qml.
Rectangle {
    id: basket
    width: 300
    height: 64
    radius: 8
    fill: look.basket

    // Remix knobs: change any item price in one line.
    readonly property real teaPrice: 3.5
    readonly property real breadPrice: 2.25
    readonly property real jamPrice: 4.0

    property int teaBought: 0
    property int breadBought: 0
    property int jamBought: 0

    readonly property int count: teaBought + breadBought + jamBought
    readonly property real total: teaBought * teaPrice + breadBought * breadPrice + jamBought * jamPrice
    readonly property int teaCount: teaBought
    readonly property int breadCount: breadBought
    readonly property int jamCount: jamBought
    readonly property string summary: t`${plural(count, { one: "# in the basket", other: "# in the basket" })} · £${total.toFixed(2)}`

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

    Object {
        id: look
        readonly property bool dark: App.hints.colorScheme === ColorScheme.Dark
        readonly property color basket: dark ? "#2a2118" : "#fbf1de"
        readonly property color basketMuted: dark ? "#d8c39a" : "#6b5a3a"
        readonly property color basketStatus: dark ? "#f3c97e" : "#7a4c00"
        readonly property color ink: dark ? "#f5eeda" : "#1b1f2a"
    }

    // Contributes the live summary into whichever shell places a StatusSlot.
    Contribution {
        slot: "status"
        delegate: Component {
            Text {
                objectName: "statusText"
                color: look.basketStatus
                font.size: 16
                text: basket.summary
            }
        }
    }

    Text {
        objectName: "basketText"
        anchors.left: parent.left
        anchors.leftMargin: 14
        y: 10
        color: look.ink
        font.size: 18
        text: t`Basket`
    }
    Text {
        objectName: "basketSummary"
        anchors.left: parent.left
        anchors.leftMargin: 14
        y: 36
        color: look.basketMuted
        font.size: 16
        text: basket.summary
    }
}
