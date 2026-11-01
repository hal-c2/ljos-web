import QtQuick
import Ljos.Blocks
Row {
  property list<Contribution> tools
  Slot { name: "toolbar.tools"; contributions: parent.tools }
}
