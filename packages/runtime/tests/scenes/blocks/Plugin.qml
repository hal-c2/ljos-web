import QtQuick
import Ljos.Blocks
Item {
  Contribution { slot: "tools"; mode: Contribution.Replace
    // What throws in a handler of it is the web's "a native handler panics".
    Rectangle { objectName: "plugged"; width: 10; height: 10; signal poke(); onPoke: { throw new Error("broken plugin") } } }
}
