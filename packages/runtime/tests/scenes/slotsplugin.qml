import QtQuick
import Ljos.Blocks
Item {
  id: root
  objectName: "root"
  property bool plugin: false
  Row {
    Slot { objectName: "slot"; name: "tools"
      Rectangle { objectName: "own"; width: 10; height: 10 } }
  }
  Loader { objectName: "loader"; active: root.plugin; source: "blocks/Plugin.qml" }
}
