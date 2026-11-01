import QtQuick
import Ljos.Blocks
Item {
  objectName: "root"
  Slot { objectName: "slot"; name: "empty"
    Text { objectName: "placeholder"; text: "Nothing here" } }
  Contribution { slot: "elsewhere"; Item { objectName: "other" } }
}
