import QtQuick

// A Binding on an object a loaded app names (Demos/logic/live.ts), which
// the file that holds it knows only as an unknown value: Ljos.Core's
// Binding takes its `target` as a QtObject.
Binding {
    property var object
    target: object
}
