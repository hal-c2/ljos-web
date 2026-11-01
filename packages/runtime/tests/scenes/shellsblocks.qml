import QtQuick
import Ljos.Blocks
// The site's blocks are outside the shell: the shell only places them.
Item {
  objectName: "root"
  property alias counter: counter
  property alias loader: loader
  QtObject { id: counter; property int count: 0; function add() { count += 1 } }
  Contribution { slot: "main"
    Rectangle { objectName: "counter-view"; width: 30; height: 10; property int shown: counter.count } }
  ShellLoader { id: loader; objectName: "loader"; source: "user/Shell.qml"; fallback: "blocks/Default.qml" }
}
