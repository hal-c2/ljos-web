// `import QtNetwork`: NetworkInformation, as the browser tells of its
// network.
//
// Ljós's shape (ljos_platform's NetworkInformation): four read-only
// properties the system says, kept up as it says them again. A browser
// tells whether it is online (`navigator.onLine` and its `online` and
// `offline` events) and, where it has the Network Information API, what
// carries it and whether the reader asked to save data. It never tells of
// a captive portal, so that is always false here. Where nothing tells of
// a network at all (a prerender), the reachability is Unknown.
import { defineType, flush, QtObject, slot } from "../object.ts";
import { listen, singleton } from "../QtQml/application.ts";

const Unknown = 0;
const Disconnected = 1;
const Local = 2;
const Site = 3;
const Online = 4;
const Ethernet = 1;
const Cellular = 2;
const WiFi = 3;
const Bluetooth = 4;

const MEDIA = { ethernet: Ethernet, cellular: Cellular, wifi: WiFi, bluetooth: Bluetooth };

const reachabilityOf = (online) => (online === true ? Online : online === false ? Disconnected : Unknown);

export const NetworkInformation = defineType("NetworkInformation", QtObject, {
  properties: {
    reachability: Unknown,
    isBehindCaptivePortal: false,
    transportMedium: Unknown,
    isMetered: false,
  },
  enums: { Unknown, Disconnected, Local, Site, Online, Ethernet, Cellular, WiFi, Bluetooth },
  setup(self) {
    const connection = globalThis.navigator?.connection;
    const read = () => {
      slot(self, "reachability").provide(reachabilityOf(globalThis.navigator?.onLine));
      slot(self, "transportMedium").provide(MEDIA[connection?.type] ?? Unknown);
      // The web has no word for metered: a reader who asks to save data,
      // or a cellular link, is the nearest it says.
      slot(self, "isMetered").provide(connection?.saveData === true || connection?.type === "cellular");
    };
    const update = () => {
      read();
      flush();
    };
    read();
    listen(window, "online", update);
    listen(window, "offline", update);
    if (connection?.addEventListener) listen(connection, "change", update);
  },
});

// All four are the browser's to say, never the program's.
singleton(NetworkInformation, ["reachability", "isBehindCaptivePortal", "transportMedium", "isMetered"]);
