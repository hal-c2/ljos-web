import QtQml

QtObject {
    enum State { Stopped, Playing }
    property int volume
    readonly property string title: "the mock"
    signal finished(real position)
    function seek(position) {}
}
