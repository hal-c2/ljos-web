// Plugin: who a map's pictures come from.
//
// Qt loads a provider by name. Here there are the two a Qt without keys has:
// "osm", whose kinds of map are those of Qt's, each a pattern for the address
// of a tile, and "itemsoverlay", a map of nothing for items to be on. Of what
// a provider does besides maps (routes, addresses, places) there is none.
import { contents, defineType, derived, effect, QtObject, slot } from "../object.ts";
import { lazy } from "../QtQuick/compute.ts";

const EMPTY = Object.freeze([]);

// `MapType.StreetMap`: the styles a kind of map can have.
export const MapType = Object.freeze({
  NoMap: 0,
  StreetMap: 1,
  SatelliteMapDay: 2,
  SatelliteMapNight: 3,
  TerrainMap: 4,
  HybridMap: 5,
  TransitMap: 6,
  GrayStreetMap: 7,
  PedestrianMap: 8,
  CarNavigationMap: 9,
  CycleMap: 10,
  CustomMap: 100,
});

// What a kind of map is drawn from: the pattern, with Qt's `%z`, `%x` and
// `%y`, and whose it is. Not for a program to read.
const sources = new WeakMap();
export const sourceOf = (type) => sources.get(type);

// How far tiles go; closer than that they are enlarged.
const TILED = Object.freeze({ minimumZoomLevel: 0, maximumZoomLevel: 19 });
const DRAWN = Object.freeze({ minimumZoomLevel: 0, maximumZoomLevel: 30 });

function kind(style, name, description, pattern, copyright, night = false, cameraCapabilities = TILED) {
  const type = Object.freeze({ style, name, description, mobile: false, night, cameraCapabilities });
  sources.set(type, { pattern, copyright });
  return type;
}

// A map's and its data's owners, as Qt words it.
function owned(map, data) {
  const parts = [];
  if (map) parts.push(`Map &copy; ${map}`);
  if (data) parts.push(`Data &copy; ${data}`);
  return parts.join(" | ");
}

const OPENSTREETMAP = "<a href='http://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors";
const STREET = owned("<a href='http://www.openstreetmap.org/copyright'>OpenStreetMap.org</a>", OPENSTREETMAP);
const THUNDERFOREST = owned("<a href='http://www.thunderforest.com/'>Thunderforest</a>", OPENSTREETMAP);

// Qt's own addresses, which it has for when it cannot ask its server for
// better ones: a browser asks them the same over https.
const OSM = Object.freeze([
  kind(1, "Street Map", "Street map view in daylight mode", "https://tile.openstreetmap.org/%z/%x/%y.png", STREET),
  kind(10, "Cycle Map", "Cycle map view in daylight mode", "https://c.tile.opencyclemap.org/cycle/%z/%x/%y.png", THUNDERFOREST),
  kind(
    6,
    "Transit Map",
    "Public transit map view in daylight mode",
    "https://c.tile2.opencyclemap.org/transport/%z/%x/%y.png",
    THUNDERFOREST,
  ),
  kind(
    6,
    "Night Transit Map",
    "Public transit map view in night mode",
    "https://a.tile.thunderforest.com/transport-dark/%z/%x/%y.png",
    THUNDERFOREST,
    true,
  ),
  kind(4, "Terrain Map", "Terrain map view", "https://a.tile.thunderforest.com/landscape/%z/%x/%y.png", THUNDERFOREST),
  kind(8, "Hiking Map", "Hiking map view", "https://a.tile.thunderforest.com/outdoors/%z/%x/%y.png", THUNDERFOREST),
]);

const OVERLAY = Object.freeze([kind(0, "Empty Map", "Empty Map", null, "", false, DRAWN)]);

// What a map without a provider shows.
export const NO_MAP = kind(0, "No Map", "No Map", null, "", false, DRAWN);

// The last of a name is the one, as in the map Qt makes of them.
function parameter(plugin, name) {
  const given = plugin.parameters.findLast((each) => each.name === name);
  return given ? String(given.value) : undefined;
}

// `osm.mapping.custom.host`: a server of one's own, as one more kind of map.
function custom(plugin) {
  let host = parameter(plugin, "osm.mapping.custom.host") ?? parameter(plugin, "osm.mapping.host");
  if (host === undefined) return OSM;
  if (!host.includes("%x")) host += "%z/%x/%y.png";
  const copyright =
    owned(parameter(plugin, "osm.mapping.custom.mapcopyright"), parameter(plugin, "osm.mapping.custom.datacopyright")) ||
    (parameter(plugin, "osm.mapping.copyright") ?? "");
  const type = kind(100, "Custom URL Map", "Custom url map view set via urlprefix parameter", host, copyright);
  return Object.freeze([...OSM, type]);
}

// What each has: its kinds of map, and which of `Plugin`'s mapping features.
const PROVIDERS = {
  osm: { types: custom, mapping: 1 },
  itemsoverlay: { types: () => OVERLAY, mapping: 2 },
};

const ANY = -1;

export const Plugin = defineType("Plugin", QtObject, {
  properties: {
    name: "",
    parameters: EMPTY,
    availableServiceProviders: Object.freeze(Object.keys(PROVIDERS)),
    isAttached: derived((self) => self.name !== ""),
  },
  signals: ["attached"],
  enums: {
    NoMappingFeatures: 0,
    OnlineMappingFeature: 1,
    OfflineMappingFeature: 2,
    LocalizedMappingFeature: 4,
    AnyMappingFeatures: ANY,
    NoRoutingFeatures: 0,
    OnlineRoutingFeature: 1,
    OfflineRoutingFeature: 2,
    LocalizedRoutingFeature: 4,
    RouteUpdatesFeature: 8,
    AlternativeRoutesFeature: 16,
    ExcludeAreasRoutingFeature: 32,
    AnyRoutingFeatures: ANY,
    NoGeocodingFeatures: 0,
    OnlineGeocodingFeature: 1,
    OfflineGeocodingFeature: 2,
    ReverseGeocodingFeature: 4,
    LocalizedGeocodingFeature: 8,
    AnyGeocodingFeatures: ANY,
    NoPlacesFeatures: 0,
    OnlinePlacesFeature: 1,
    OfflinePlacesFeature: 2,
    SavePlaceFeature: 4,
    RemovePlaceFeature: 8,
    SaveCategoryFeature: 16,
    RemoveCategoryFeature: 32,
    PlaceRecommendationsFeature: 64,
    SearchSuggestionsFeature: 128,
    LocalizedPlacesFeature: 256,
    NotificationsFeature: 512,
    PlaceMatchingFeature: 1024,
    AnyPlacesFeatures: ANY,
    NoNavigationFeatures: 0,
    OnlineNavigationFeature: 1,
    OfflineNavigationFeature: 2,
    AnyNavigationFeatures: ANY,
  },
  methods: {
    // All of `features`, or with none named any at all.
    supportsMapping(features = ANY) {
      const has = PROVIDERS[this.name]?.mapping;
      if (has === undefined) return false;
      return features === ANY ? has !== 0 : (has & features) === features;
    },
    supportsRouting: () => false,
    supportsGeocoding: () => false,
    supportsPlaces: () => false,
    supportsNavigation: () => false,
    // Whether a map can do nothing with it: a name no provider has.
    $unknown() {
      const name = this.name;
      return name !== "" && !PROVIDERS[name];
    },
  },
  setup(self) {
    // The kinds of map it has: the same list until it is another provider
    // or is told something else.
    self.$kinds = lazy(self, () => PROVIDERS[self.name]?.types(self) ?? EMPTY, EMPTY);
    effect(
      () => self.isAttached,
      (attached) => void (attached && self.attached()),
    );
  },
  adopt(self, props) {
    slot(self, "parameters").provide(Object.freeze(contents(props)));
  },
});
