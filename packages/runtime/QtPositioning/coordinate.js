// `coordinate`: a place on the Earth, QML's `geoCoordinate` value.
//
// Two of the same place are one object: `a === b` says what it says in QML,
// and a property given the place it has has not changed. A place is not
// changed, another is made: `center.latitude = 5` is refused.
import { general, Point } from "../QtQml/values.ts";

// Qt's mean radius of the Earth, in metres.
const RADIUS = 6371007.2;
const radians = (degrees) => degrees * (Math.PI / 180);
const degrees = (radians) => radians * (180 / Math.PI);

// One angle of a place as Qt writes it, without its sign: degrees, degrees
// and minutes, or degrees, minutes and seconds. What rounds up to sixty
// carries, as in Qt.
function angle(value, parts) {
  let whole = Math.abs(value);
  if (parts === 0) return `${whole.toFixed(5)}°`;
  let minutes = (whole - Math.trunc(whole)) * 60;
  if (parts === 1) {
    if (minutes > 59.9995) {
      whole++;
      minutes = 0;
    }
    return `${Math.trunc(whole)}° ${minutes.toFixed(3)}'`;
  }
  let seconds = (minutes - Math.trunc(minutes)) * 60;
  if (seconds >= 59.95) {
    minutes++;
    seconds = 0;
    if (Math.round(minutes) >= 60) {
      whole++;
      minutes = 0;
    }
  }
  return `${Math.trunc(whole)}° ${Math.trunc(minutes)}' ${seconds.toFixed(1)}"`;
}

// With a sign, or with the half of the Earth it is on.
function signed(value, parts, hemisphere, negative, positive) {
  const text = angle(value, parts);
  if (!hemisphere) return value < 0 ? `-${text}` : text;
  return value < 0 ? `${text} ${negative}` : value > 0 ? `${text} ${positive}` : text;
}

class Coordinate {
  constructor(latitude, longitude, altitude) {
    this.latitude = latitude;
    this.longitude = longitude;
    this.altitude = altitude;
    this.isValid = !Number.isNaN(latitude);
    Object.freeze(this);
  }
  // In metres, along the surface of a sphere.
  distanceTo(other) {
    if (!this.isValid || !other?.isValid) return 0;
    const latitude = Math.sin(radians(other.latitude - this.latitude) / 2);
    const longitude = Math.sin(radians(other.longitude - this.longitude) / 2);
    const haversine =
      latitude * latitude + Math.cos(radians(this.latitude)) * Math.cos(radians(other.latitude)) * longitude * longitude;
    return 2 * Math.asin(Math.sqrt(haversine)) * RADIUS;
  }
  // In degrees clockwise from north.
  azimuthTo(other) {
    if (!this.isValid || !other?.isValid) return 0;
    const turn = radians(other.longitude - this.longitude);
    const from = radians(this.latitude);
    const to = radians(other.latitude);
    const y = Math.sin(turn) * Math.cos(to);
    const x = Math.cos(from) * Math.sin(to) - Math.sin(from) * Math.cos(to) * Math.cos(turn);
    const azimuth = degrees(Math.atan2(y, x)) + 360;
    const whole = Math.trunc(azimuth);
    return ((whole + 360) % 360) + (azimuth - whole);
  }
  atDistanceAndAzimuth(distance, azimuth) {
    if (!this.isValid) return INVALID;
    const latitude = radians(this.latitude);
    const bearing = radians(azimuth);
    const ratio = distance / RADIUS;
    const to = Math.asin(Math.sin(latitude) * Math.cos(ratio) + Math.cos(latitude) * Math.sin(ratio) * Math.cos(bearing));
    const turn = Math.atan2(
      Math.sin(bearing) * Math.sin(ratio) * Math.cos(latitude),
      Math.cos(ratio) - Math.sin(latitude) * Math.sin(to),
    );
    let longitude = degrees(radians(this.longitude) + turn);
    if (longitude > 180) longitude -= 360;
    else if (longitude < -180) longitude += 360;
    return coordinate(degrees(to), longitude, this.altitude);
  }
  // `format` is one of `QtPositioning.Degrees` and the rest: the odd ones
  // name the hemisphere.
  toString(format = 5) {
    if (!this.isValid) return "";
    const parts = format >> 1;
    const hemisphere = format % 2 === 1;
    const place = `${signed(this.latitude, parts, hemisphere, "S", "N")}, ${signed(this.longitude, parts, hemisphere, "W", "E")}`;
    return Number.isNaN(this.altitude) ? place : `${place}, ${general(this.altitude)}m`;
  }
}

// Nowhere: what a latitude or a longitude that is none makes.
export const INVALID = new Coordinate(NaN, NaN, NaN);

// The places there are, for as long as something holds them.
const places = new Map();
const forgotten = new FinalizationRegistry((key) => {
  if (!places.get(key)?.deref()) places.delete(key);
});

export function coordinate(latitude, longitude, altitude = NaN) {
  latitude = Number(latitude);
  longitude = Number(longitude);
  altitude = Number(altitude);
  if (!(latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180)) return INVALID;
  const key = `${latitude},${longitude},${altitude}`;
  let place = places.get(key)?.deref();
  if (!place) {
    place = new Coordinate(latitude, longitude, altitude);
    places.set(key, new WeakRef(place));
    forgotten.register(place, key);
  }
  return place;
}

// Web Mercator, the square a map of tiles is drawn on: 0 to 1 from 180° west
// to 180° east and from 85.05° north to as far south. Qt's bounds on what is
// beyond the square are kept.
const CUT = 4;

export function mercatorX(longitude) {
  return longitude / 360 + 0.5;
}

export function mercatorY(latitude) {
  const y = (1 - Math.log(Math.tan(radians((90 + latitude) / 2))) / Math.PI) / 2;
  return Math.min(Math.max(y, -CUT), 1 + CUT);
}

export function latitudeAt(y) {
  if (y <= -CUT) return 90;
  if (y >= 1 + CUT) return -90;
  return degrees(2 * Math.atan(Math.exp(Math.PI * (1 - 2 * y)))) - 90;
}

// The square is one of a row without end: any `x` is a longitude.
export function longitudeAt(x) {
  if (x < 0) x = 1 - (-x - Math.trunc(-x));
  return (x - Math.trunc(x)) * 360 - 180;
}

// A place on the square is on the ground, as Qt has it.
export const fromMercator = (x, y) => coordinate(latitudeAt(y), longitudeAt(x), 0);

export const toMercator = (place) => new Point(mercatorX(place.longitude), mercatorY(place.latitude));
