import QtQuick

Rectangle {
    property int count
    signal tapped(int at)
    count: 2
    onCountChanged: console.log(count)
    onTapped: (at) => console.log(at)
}
