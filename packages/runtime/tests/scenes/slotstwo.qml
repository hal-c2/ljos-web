import QtQuick
import Ljos.Blocks
Item {
  objectName: "root"
  Row { objectName: "left"; Slot { name: "status" } }
  Row { objectName: "right"; Slot { name: "status" } }
  Contribution { slot: "status"; Text { objectName: "clock"; text: "12:00" } }
}
