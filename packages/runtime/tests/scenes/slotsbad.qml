import QtQuick
import Ljos.Blocks
// One contribution that cannot be made, one whose binding throws when what
// it reads changes, and one that works.
Item {
  id: root
  objectName: "root"
  property bool broken: false
  Row {
    Slot { objectName: "slot"; name: "tools" }
  }
  // Given a delegate that throws by a test.
  property var spare: spareOne
  Contribution { id: spareOne; slot: ""; order: 3 }
  Contribution { slot: "tools"; order: 0
    Rectangle { objectName: "good"; width: 10; height: 10 } }
  Contribution { slot: "tools"; order: 1
    Rectangle { objectName: "made-badly"; height: 10; width: { throw new Error("made badly") } } }
  Contribution { slot: "tools"; order: 2
    Rectangle { objectName: "later"; height: 10; width: { if (root.broken) throw new Error("broke later"); return 10 } } }
}
