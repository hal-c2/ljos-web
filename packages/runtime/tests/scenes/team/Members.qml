import QtQuick
import Ljos.Models

Item {
    property alias model: m
    JsonListModel { id: m; source: "members.json" }
}
