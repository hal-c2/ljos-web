import QtQuick
import Ljos.Blocks
// The user's shell is not part of the build: the page compiles it.
Item {
  objectName: "root"
  property alias loader: loader
  ShellLoader { id: loader; objectName: "loader"; source: "user/Shell.qml"; fallback: "blocks/Default.qml" }
}
