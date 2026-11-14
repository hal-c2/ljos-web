import QtQuick
import Ljos.Blocks
// No user's shell yet: the application's runs until one is given.
Item {
  objectName: "root"
  property alias loader: loader
  ShellLoader { id: loader; objectName: "loader"; fallback: "blocks/Noted.qml" }
}
