import QtQuick
import Ljos.Blocks
Item {
  objectName: "root"
  property alias moving: moving
  Row { objectName: "left"; Slot { objectName: "left-slot"; name: "left" } }
  Row { objectName: "right"; Slot { objectName: "right-slot"; name: "right" } }
  Contribution { id: moving; objectName: "moving"; slot: "left"; Item { objectName: "thing" } }
}
