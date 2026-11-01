import QtQuick
import Ljos.Blocks
Item {
  objectName: "root"
  Row { Slot { objectName: "slot"; name: "tools" } }
  Contribution { slot: "tools"; order: 2
    Rectangle { objectName: "c"; width: 10; height: 10 } }
  Contribution { slot: "tools"
    Rectangle { objectName: "a"; width: 10; height: 10 } }
  Contribution { slot: "tools"
    Rectangle { objectName: "b"; width: 10; height: 10 } }
}
