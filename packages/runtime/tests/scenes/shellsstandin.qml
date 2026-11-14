import QtQuick
import Ljos.Blocks
// The user's shell is fetched and compiled; the application's stands in
// for it meanwhile, and a reader may already be using it.
Item {
  objectName: "root"
  property alias loader: loader
  ShellLoader { id: loader; objectName: "loader"; source: "user/Shell.qml"; fallback: "blocks/Noted.qml" }
}
