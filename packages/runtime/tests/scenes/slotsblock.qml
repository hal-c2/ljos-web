import QtQuick
import Ljos.Blocks
import "blocks"
Item {
  objectName: "root"
  Toolbar {
    objectName: "bar"
    tools: [
      Contribution { Rectangle { objectName: "save"; width: 10; height: 10 } },
      Contribution { order: -1; Rectangle { objectName: "open"; width: 10; height: 10 } }
    ]
  }
}
