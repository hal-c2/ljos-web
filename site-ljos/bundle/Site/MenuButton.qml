import QtQuick
import Site
import Ljos.Core

// The narrow layout's menu: three bars that become a cross while the
// menu is open.
IconButton {
    id: menu

    property bool open: false

    // The label says what a press does, so the state is said once:
    // a button that also said it was checked would say it twice.
    label: open ? t`Close menu` : t`Menu`

    Repeater {
        model: 3
        Rectangle {
            required property int index
            x: Math.round((menu.width - width) / 2)
            y: menu.height / 2 - 1 + (menu.open ? 0 : (index - 1) * 6)
            width: 18
            height: 2
            radius: 1
            color: Theme.text
            opacity: menu.open && index === 1 ? 0 : 1
            rotation: menu.open ? (index === 0 ? 45 : index === 2 ? -45 : 0) : 0
            Behavior on y { NumberAnimation { duration: Theme.calm ? 0 : Theme.moveSmall; easing.type: Easing.OutCubic } }
            Behavior on rotation { NumberAnimation { duration: Theme.calm ? 0 : Theme.moveSmall; easing.type: Easing.OutCubic } }
            Behavior on opacity { NumberAnimation { duration: Theme.exitSmall } }
        }
    }
}
