import QtQuick
import Ljos.Blocks
Item {
  objectName: "root"
  Row {
    Slot { name: "tools"; Rectangle { objectName: "own"; width: 10; height: 10 } }
  }
  Contribution { slot: "tools"
    Rectangle { objectName: "added"; width: 10; height: 10 } }
  Contribution { slot: "tools"; mode: Contribution.Prepend; order: 1
    Rectangle { objectName: "second"; width: 10; height: 10 } }
  Contribution { slot: "tools"; mode: Contribution.Prepend
    Rectangle { objectName: "first"; width: 10; height: 10 } }
}
