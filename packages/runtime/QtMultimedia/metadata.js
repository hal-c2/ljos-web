// mediaMetaData: what is known about a media file or one of its tracks, by
// key. A browser tells little of it: how long the file is, the size of its
// picture, the language of a track.
import { Size } from "../QtQml/values.ts";

// What `metaDataKeyToString` gives, in the order of `MediaMetaData.Key`.
const NAMES = [
  "Title",
  "Author",
  "Comment",
  "Description",
  "Genre",
  "Date",
  "Language",
  "Publisher",
  "Copyright",
  "Url",
  "Duration",
  "Media type",
  "Container Format",
  "Audio bit rate",
  "Audio codec",
  "Video bit rate",
  "Video codec",
  "Video frame rate",
  "Album title",
  "Album artist",
  "Contributing artist",
  "Track number",
  "Composer",
  "Lead performer",
  "Thumbnail image",
  "Cover art image",
  "Orientation",
  "Resolution",
  "Has HDR content",
];

// `MediaMetaData.Title` and the rest.
export const MediaMetaData = {
  Title: 0,
  Author: 1,
  Comment: 2,
  Description: 3,
  Genre: 4,
  Date: 5,
  Language: 6,
  Publisher: 7,
  Copyright: 8,
  Url: 9,
  Duration: 10,
  MediaType: 11,
  FileFormat: 12,
  AudioBitRate: 13,
  AudioCodec: 14,
  VideoBitRate: 15,
  VideoCodec: 16,
  VideoFrameRate: 17,
  AlbumTitle: 18,
  AlbumArtist: 19,
  ContributingArtist: 20,
  TrackNumber: 21,
  Composer: 22,
  LeadPerformer: 23,
  ThumbnailImage: 24,
  CoverArtImage: 25,
  Orientation: 26,
  Resolution: 27,
  HasHdrContent: 28,
};

const two = (number) => String(number).padStart(2, "0");

// A language as Qt writes one: by its English name. A browser has its tag.
function language(tag) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

// A duration as Qt writes one: the hours, minutes and seconds of the clock.
function time(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${two(Math.floor(seconds / 3600) % 24)}:${two(Math.floor(seconds / 60) % 60)}:${two(seconds % 60)}`;
}

export class MetaData {
  constructor(entries) {
    this.entries = new Map(entries);
  }
  keys() {
    return [...this.entries.keys()].sort((a, b) => a - b);
  }
  value(key) {
    return this.entries.get(key);
  }
  stringValue(key) {
    const value = this.entries.get(key);
    if (value === undefined) return "";
    if (key === MediaMetaData.Duration) return time(value);
    if (key === MediaMetaData.Language) return language(value);
    if (value instanceof Size) return `${value.width} x ${value.height}`;
    return String(value);
  }
  metaDataKeyToString(key) {
    return NAMES[key] ?? "";
  }
  isEmpty() {
    return this.entries.size === 0;
  }
  insert(key, value) {
    this.entries.set(key, value);
  }
  remove(key) {
    this.entries.delete(key);
  }
  clear() {
    this.entries.clear();
  }
}
