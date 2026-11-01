import QtQuick
import Ljos.Blocks
Item {
  objectName: "root"
  property alias loader: loader
  ShellLoader { id: loader; objectName: "loader"; source: "user/Shell.qml"; fallback: "user/Default.qml" }
}
