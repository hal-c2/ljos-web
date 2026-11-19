// Two directories imported under one name are one namespace: the types of
// both are known by it, a singleton of either is its object, and a type
// both have is the one imported last.
import QtQuick
import "shared/first" as P
import "shared/second" as P

Item {
    width: 200
    height: 100
    property int hour: P.Clock.hour

    P.Alarm {
        id: alarm
    }
    P.Shot {
        id: shot
    }

    function read() {
        return [hour, alarm.objectName, shot.objectName]
    }
}
