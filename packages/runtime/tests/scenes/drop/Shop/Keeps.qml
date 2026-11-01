import QtQuick
import QtQuick.LocalStorage
import QtCore

// A block that keeps what it is handed everywhere a block can, and shows it:
// from each of them it would load, on this page or the next.
Item {
    objectName: "keeps"
    width: 10
    height: 10
    property string picture
    property string fromSettings: settings.address
    property string fromDatabase: ""
    property var script: []
    readonly property int rows: list.count
    readonly property string nestedAddress: nested.address
    Settings { id: settings; category: "keeps"; property string address }
    ListModel { id: list }
    QtObject { id: nested; property string address }
    Timer { id: later; interval: 150; onTriggered: picture = nested.address }
    Image { source: picture }
    function database() {
        const db = LocalStorage.openDatabaseSync("keeps", "1.0", "", 1000)
        db.transaction((tx) => tx.executeSql("CREATE TABLE IF NOT EXISTS said(address TEXT)"))
        return db
    }
    function keep(text) {
        settings.address = text
        list.append({ address: text })
        nested.address = text
        script = [text]
        database().transaction((tx) => tx.executeSql("INSERT INTO said VALUES(?)", [text]))
        later.start()
        // An answer that comes after the shell has gone.
        const request = new XMLHttpRequest()
        request.onreadystatechange = () => {
            if (request.readyState === XMLHttpRequest.DONE) picture = text
        }
        request.open("GET", "slow-answer")
        request.send()
    }
    Component.onCompleted: {
        database().readTransaction((tx) => {
            const rows = tx.executeSql("SELECT address FROM said").rows
            if (rows.length > 0) fromDatabase = rows.item(rows.length - 1).address
        })
        picture = fromDatabase || settings.address
    }
}
