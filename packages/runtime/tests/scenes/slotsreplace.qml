import QtQuick
import Ljos.Blocks
Item {
  objectName: "root"
  Row {
    Slot { name: "tools"; Rectangle { objectName: "own"; width: 10; height: 10 } }
  }
  Contribution { slot: "tools"
    Rectangle { objectName: "early"; width: 10; height: 10 } }
  Contribution { slot: "tools"; mode: Contribution.Replace; order: 1
    Rectangle { objectName: "instead"; width: 10; height: 10 } }
  Contribution { slot: "tools"; order: 2
    Rectangle { objectName: "late"; width: 10; height: 10 } }
}
