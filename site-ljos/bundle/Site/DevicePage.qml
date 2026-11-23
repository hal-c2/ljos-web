import QtQuick
import Site

// One of a DeviceFrame's panels: the tab `index` of `frame` names it,
// and it shows while that tab is chosen, crossfading with the one
// before it.
Item {
    id: page

    required property var frame
    required property int index
    readonly property bool chosen: frame.current === index
    default property alias content: holder.data

    width: parent ? parent.width : 0
    height: parent ? parent.height : 0
    opacity: chosen ? 1 : 0
    visible: opacity > 0
    Accessible.role: Accessible.PropertyPage
    Accessible.name: frame.tabs[index] || ""

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
