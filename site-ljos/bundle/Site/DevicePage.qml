import Ljos.Ui
import Site

// One of a DeviceFrame's panels: the tab `index` of `frame` names it,
// and it shows while that tab is chosen, crossfading with the one
// before it. In a frame laid out as a console, a panel it names in its
// `columns` stands at its side, always shown, a region of its own; any
// other does not show.
Item {
    id: page

    required property DeviceFrame frame
    required property int index
    // Where it stands in a console: 0 on the left, 1 on the right, -1 not.
    readonly property int column: frame.consoleLayout ? frame.columns.indexOf(index) : -1
    readonly property bool chosen: frame.consoleLayout ? column >= 0 : frame.current === index
    default property alias content: holder.data

    x: column === 1 ? frame.width - frame.side : 0
    width: column >= 0 ? frame.side : parent !== null ? parent.width : 0
    height: parent !== null ? parent.height : 0
    opacity: chosen ? 1 : 0
    visible: opacity > 0
    Accessible.role: column >= 0 ? Accessible.Section : Accessible.PropertyPage
    Accessible.name: column >= 0 ? frame.columnNames[column === 0 ? 0 : 2] ?? "" : frame.tabs[index] ?? ""

    Behavior on opacity {
        NumberAnimation {
            duration: page.chosen ? Theme.enterPanel : Theme.exitSmall
            easing.type: Easing.OutCubic
        }
    }

    Item {
        id: holder
        anchors.fill: parent
    }
}
