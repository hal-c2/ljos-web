// import QtQml.XmlListModel
// Item {
//     id: root; width: 400; height: 300
//     property url source: "../fixtures/feed.xml"
//     property string query: "/rss/channel/item"
//     XmlListModel {
//         id: feed; source: root.source; query: root.query
//         onStatusChanged: log.push("status " + status + " " + count + " " + progress)
//         onCountChanged: log.push("count " + count)
//         XmlListModelRole { name: "title"; elementName: "title" }
//         XmlListModelRole { name: "id"; attributeName: "id" }
//         XmlListModelRole { name: "link"; elementName: "link" }
//         XmlListModelRole { id: image; name: "image"; elementName: "content"; attributeName: "url" }
//         XmlListModelRole { name: "prefixed"; elementName: "media:content"; attributeName: "url" }
//         XmlListModelRole { name: "deep"; elementName: "nested/deep" }
//     }
//     XmlListModel { id: single; source: "../fixtures/feed.xml"; query: "/rss/channel/item"; XmlListModelRole { name: "title"; elementName: "title" } }
//     XmlListModel { id: none }
//     Repeater {
//         id: rows; model: feed
//         Rectangle {
//             y: index * 20; width: 100; height: 18
//             property var all: [title, model.id, link, image, prefixed, deep]
//             Component.onDestruction: log.push("destroyed " + title)
//         }
//     }
//     Repeater { id: titles; model: single; Item { property string value: modelData } }
// }
import { $component, $define, $object, $signal } from "ljos-web/object";
import { XmlListModel, XmlListModelRole } from "ljos-web/QtQml/XmlListModel";
import { Item, Rectangle, Repeater } from "ljos-web/QtQuick";
import { make } from "../scene.js";

export const objects = { log: [], made: 0, XmlListModel };

const fixture = (name) => `${location.origin}/fixtures/${name}`;

export default function Feed() {
  const { log } = objects;
  for (const name of ["root", "feed", "single", "none", "image", "rows", "titles"]) objects[name] = $object();
  const { root, feed, single, none, image, rows, titles } = objects;
  const [source, setSource] = $signal(fixture("feed.xml"));
  const [query, setQuery] = $signal("/rss/channel/item");
  const scene = make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(
      XmlListModel,
      {
        $self: feed,
        get source() {
          return source();
        },
        get query() {
          return query();
        },
        onStatusChanged: () => log.push(`status ${feed.status} ${feed.count} ${feed.progress}`),
        onCountChanged: () => log.push(`count ${feed.count}`),
      },
      () => [
        make(XmlListModelRole, { name: "title", elementName: "title" }),
        make(XmlListModelRole, { name: "id", attributeName: "id" }),
        make(XmlListModelRole, { name: "link", elementName: "link" }),
        make(XmlListModelRole, { $self: image, name: "image", elementName: "content", attributeName: "url" }),
        make(XmlListModelRole, { name: "prefixed", elementName: "media:content", attributeName: "url" }),
        make(XmlListModelRole, { name: "deep", elementName: "nested/deep" }),
      ],
    ),
    make(XmlListModel, { $self: single, source: fixture("feed.xml"), query: "/rss/channel/item" }, () => [
      make(XmlListModelRole, { name: "title", elementName: "title" }),
    ]),
    make(XmlListModel, { $self: none }),
    make(Repeater, {
      $self: rows,
      get model() {
        return feed;
      },
      delegate: $component(($data) => {
        objects.made++;
        return $define(
          make(Rectangle, {
            get y() {
              return $data.index * 20;
            },
            width: 100,
            height: 18,
            Component$onDestruction: () => log.push(`destroyed ${$data.title}`),
          }),
          {
            all: [() => [$data.title, $data.model.id, $data.link, $data.image, $data.prefixed, $data.deep]],
          },
        );
      }),
    }),
    make(Repeater, {
      $self: titles,
      get model() {
        return single;
      },
      delegate: $component(($data) => $define(make(Item, {}), { value: [() => $data.modelData] })),
    }),
  ]);
  return $define(scene, { source: [source, setSource], query: [query, setQuery], fixture });
}
