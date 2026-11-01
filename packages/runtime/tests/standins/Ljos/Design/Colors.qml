pragma Singleton
import QtQuick

// What stands in for Ljós's own palette here: its roles by the same names,
// each a colour a test can tell apart for each scheme and contrast.
QtObject {
    property bool dark: false
    property bool highContrast: false
    readonly property color text: dark ? (highContrast ? "#ffffff" : "#eeeeee") : (highContrast ? "#000000" : "#123456")
    readonly property color accent: "#3366cc"
}
