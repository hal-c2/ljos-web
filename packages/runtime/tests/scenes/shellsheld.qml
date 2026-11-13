import QtQuick
import Ljos.Blocks
// The user's shell is compiled in the page; the application's own, which
// stands in for it meanwhile, holds a block of a file of the build's.
Item {
  objectName: "root"
  property alias loader: loader
  ShellLoader { id: loader; objectName: "loader"; source: "user/Shell.qml"; fallback: "blocks/Held.qml" }
}
