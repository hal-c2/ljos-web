import QtQuick
import Ljos.Blocks
Item {
  objectName: "root"
  Row {
    Slot { name: "tools"; Rectangle { objectName: "own"; width: 10; height: 10 } }
  }
  Contribution { slot: "tools"
    Rectangle { objectName: "added"; width: 10; height: 10 } }
}
