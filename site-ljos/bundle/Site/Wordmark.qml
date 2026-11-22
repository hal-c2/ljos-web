import QtQuick
import Site

// The word beside the mark. Both are the user's logo, so this reads
// nothing from a shell's look: not its face, its colour or its case.
// Changing any of it is a change of logo, which needs the user's word.
Text {
    text: "Ljós"
    color: Theme.dark ? "#efece9" : "#282624"
    font.family: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Helvetica Neue, Arial, sans-serif"
    font.pixelSize: 22
    font.weight: Font.Bold
    font.capitalization: Font.MixedCase
    font.letterSpacing: 0
}
