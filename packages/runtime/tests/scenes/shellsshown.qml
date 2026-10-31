import QtQuick
import Ljos.Blocks
Item {
  objectName: "root"
  ShellLoader { objectName: "loader"; source: "blocks/Shell.qml"; fallback: "blocks/Default.qml" }
}
