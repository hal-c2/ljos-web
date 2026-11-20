import QtQuick

// An alias of an alias of an item's list: what an instance gives `relayed`
// is the host's `content`, and so the host's item's.
Item {
    property alias host: host
    property alias relayed: host.content

    AliasListHost {
        id: host
    }
}
