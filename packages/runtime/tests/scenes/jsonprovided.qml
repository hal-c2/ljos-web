import QtQuick
import Ljos.Models
// A model that has read a file before anything gives it.
Item {
  property alias model: model
  JsonListModel { id: model; source: "json/given-later.json" }
}
