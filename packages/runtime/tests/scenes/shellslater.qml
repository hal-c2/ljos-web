import QtQuick
import Ljos.Blocks
// No user's shell yet: the application's own runs, as the fallback, until
// one is given (a visitor's first edit), which takes over with its state.
Item {
  objectName: "root"
  property alias loader: loader
  ShellLoader { id: loader; objectName: "loader"; fallback: "blocks/Held.qml" }
}
