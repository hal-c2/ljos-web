import QtQuick
import QtQuick.Controls

// Never mounted: importing it makes this page one built with Qt Quick
// Controls (Ljós's own styles), so the compiler in the page can be
// given them for a reader's edits (docs/LJOS_WEB.md A15).
Item {
    Button {
        text: "host"
    }
}
