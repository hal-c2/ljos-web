// QML's Locale, and Qt's way of writing dates and numbers.
//
// The browser has the data (CLDR, through `Intl`) and Qt has the interface:
// format strings like "ddd d MMM yyyy", `locale.monthName(0)`,
// `locale.toString(1234.5, "f", 2)`. A locale's own formats are read off
// what `Intl` makes of a known date and written as Qt would write them, so
// they can be shown, edited and handed back.
import { currencyOf, decimalsOf } from "./currency.js";
import { general } from "./values.js";

export const Locale = Object.freeze({
  LongFormat: 0,
  ShortFormat: 1,
  NarrowFormat: 2,
  MetricSystem: 0,
  ImperialUSSystem: 1,
  ImperialUKSystem: 2,
  ImperialSystem: 1,
  CurrencyIsoCode: 0,
  CurrencySymbol: 1,
  CurrencyDisplayName: 2,
  DefaultNumberOptions: 0,
  OmitGroupSeparator: 1,
  RejectGroupSeparator: 2,
  OmitLeadingZeroInExponent: 4,
  RejectLeadingZeroInExponent: 8,
  IncludeTrailingZeroesAfterDot: 16,
  RejectTrailingZeroesAfterDot: 32,
  DataSizeIecFormat: 0,
  DataSizeTraditionalFormat: 2,
  DataSizeSIFormat: 3,
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
});

const WIDTHS = ["long", "short", "narrow"];
// Friday 5 January 2024, 07:08:09: no part of it reads like another.
const SAMPLE = Date.UTC(2024, 0, 5, 7, 8, 9);
const SUNDAY = Date.UTC(2024, 0, 7);
const NUMERIC = /^\p{Nd}+$/u;

// The "C" locale's formats, which are Qt's own and not CLDR's.
const C = { date: ["dddd, d MMMM yyyy", "d MM yyyy"], time: ["HH:mm:ss t", "HH:mm"] };

// A separator as a format string has to write it: letters would be read as
// fields, so they are quoted.
function literal(text) {
  const plain = text.replace(/[  ]/g, " ").replace(/'/g, "''");
  return plain.replace(/[A-Za-z](.*[A-Za-z])?/, "'$&'");
}

const part = (parts, type) => parts.find((each) => each.type === type)?.value ?? "";

// The marks that keep a sign on its side of a number written from the right.
const MARKS = /^[\u061c\u200e\u200f]+$/;
const marks = (each) => (each?.type === "literal" && MARKS.test(each.value) ? each.value : "");

// A sign with its marks, which `Intl` hands over apart and Qt as one.
function sign(parts, type) {
  const at = parts.findIndex((each) => each.type === type);
  return at < 0 ? "" : marks(parts[at - 1]) + parts[at].value + marks(parts[at + 1]);
}

// Where the number, the currency's sign and a minus sign go in an amount of
// money.
const AMOUNT = 0;
const SIGN = 1;
const MINUS = 2;

// What stands around an amount, read off how `Intl` writes one. A minus
// sign's marks are written with it, and so are not written twice.
function around(parts, minus) {
  const out = [];
  for (const [index, { type, value }] of parts.entries()) {
    if (type === "literal") {
      const led = parts[index + 1]?.type === "minusSign" && minus.endsWith(parts[index + 1].value) ? minus.slice(0, -parts[index + 1].value.length) : "";
      const text = led && value.endsWith(led) ? value.slice(0, -led.length) : value;
      if (text) out.push(text);
    } else if (type === "currency") out.push(SIGN);
    else if (type === "minusSign") out.push(MINUS);
    else if (out.at(-1) !== AMOUNT) out.push(AMOUNT);
  }
  return out;
}

class LocaleValue {
  constructor(name, tag, locale) {
    this.name = name;
    // What `Intl` is asked for; the "C" locale reads as English.
    this.$tag = tag;
    this.$locale = locale;
    this.$made = new Map();
    this.numberOptions = name === "C" ? Locale.OmitGroupSeparator : Locale.DefaultNumberOptions;
  }

  // Each answer is worked out once.
  $once(key, make) {
    if (!this.$made.has(key)) this.$made.set(key, make());
    return this.$made.get(key);
  }

  $dates(options) {
    return this.$once(JSON.stringify(options), () => new Intl.DateTimeFormat(this.$tag, { ...options, timeZone: "UTC" }));
  }

  $numbers() {
    return this.$once("numbers", () => {
      const tag = this.$tag;
      const parts = new Intl.NumberFormat(tag, { useGrouping: true }).formatToParts(-1234567.5);
      return {
        decimal: part(parts, "decimal") || ".",
        group: this.name === "C" ? "," : part(parts, "group"),
        minus: sign(parts, "minusSign") || "-",
        plus: sign(new Intl.NumberFormat(tag, { signDisplay: "always" }).formatToParts(1), "plusSign") || "+",
        percent: sign(new Intl.NumberFormat(tag, { style: "percent" }).formatToParts(1), "percentSign") || "%",
        exponent: part(new Intl.NumberFormat(tag, { notation: "scientific" }).formatToParts(1e9), "exponentSeparator"),
        zero: new Intl.NumberFormat(tag).format(0),
      };
    });
  }

  get nativeLanguageName() {
    if (this.name === "C") return "";
    return this.$once("language", () => {
      const names = new Intl.DisplayNames([this.$tag], { type: "language" });
      const whole = names.of(this.$tag);
      // "American English", but not "Deutsch (Deutschland)".
      return whole.includes("(") ? names.of(this.$locale.language) : whole;
    });
  }
  get nativeTerritoryName() {
    if (this.name === "C") return "";
    return this.$once("territory", () => new Intl.DisplayNames([this.$tag], { type: "region" }).of(this.$locale.region));
  }
  get nativeCountryName() {
    return this.nativeTerritoryName;
  }
  get decimalPoint() {
    return this.$numbers().decimal;
  }
  get groupSeparator() {
    return this.$numbers().group;
  }
  get percent() {
    return this.$numbers().percent;
  }
  get zeroDigit() {
    return this.$numbers().zero;
  }
  get negativeSign() {
    return this.$numbers().minus;
  }
  get positiveSign() {
    return this.$numbers().plus;
  }
  get exponential() {
    return this.name === "C" ? "e" : this.$numbers().exponent;
  }

  // The territory's money: its code and sign, and what is written around an
  // amount that is owned and around one that is owed.
  $money() {
    return this.$once("money", () => {
      const code = this.name === "C" ? "" : currencyOf(this.$locale.region);
      // The "C" locale has none: a sign it is handed follows the number.
      if (!code) return { code, sign: "", decimals: 2, owned: [AMOUNT, SIGN], owed: null };
      const format = new Intl.NumberFormat(this.$tag, { style: "currency", currency: code, currencySign: "accounting" });
      const parts = format.formatToParts(1);
      const owned = around(parts, this.negativeSign);
      let owed = around(format.formatToParts(-1), this.negativeSign);
      // Marks after the currency's sign are its own, and stay behind when
      // another is written for it.
      const at = parts.findIndex((each) => each.type === "currency");
      const own = marks(parts[at + 1]);
      if (own) for (const each of [owned, owed]) each.splice(each.indexOf(SIGN) + 1, 1);
      const said = parts[at].value + own;
      // Where a debt is the same but for a minus sign before the number,
      // Qt puts the sign on the number: "R$ -5,00" and not "-R$ 5,00".
      const minus = owed.indexOf(MINUS);
      const same = owed.filter((each) => each !== MINUS).join("\u0000") === owned.join("\u0000");
      if (minus >= 0 && minus < owed.indexOf(AMOUNT) && same) owed = null;
      // A sign that is only the code again is no sign, as in Qt.
      return { code, sign: said === code ? "" : said, decimals: decimalsOf(code), owned, owed };
    });
  }

  // `currencySymbol(Locale.CurrencyIsoCode)`: "USD", "$" or "US Dollar".
  currencySymbol(format = Locale.CurrencySymbol) {
    const { code, sign } = this.$money();
    if (format === Locale.CurrencyIsoCode) return code;
    if (format === Locale.CurrencySymbol) return sign;
    if (format !== Locale.CurrencyDisplayName || !code) return "";
    return this.$once("currency", () => new Intl.DisplayNames([this.$tag], { type: "currency" }).of(code));
  }

  // An amount of money as its books write it: "($1,234.57)" for a debt
  // where they bracket one, and "-1.234,57 €" where they do not.
  $amount(value, given) {
    const money = this.$money();
    const said = given || (given === undefined && money.sign) || money.code;
    const debt = money.owed && (value < 0 || Number.isNaN(value));
    const number = this.$number(debt ? -value : value, "f", money.decimals);
    const write = (each) => (each === AMOUNT ? number : each === SIGN ? said : each === MINUS ? this.negativeSign : each);
    return (debt ? money.owed : money.owned).map(write).join("");
  }

  $week() {
    const locale = this.$locale;
    return (this.name !== "C" && (locale.getWeekInfo?.() ?? locale.weekInfo)) || { firstDay: 1, weekend: [6, 7] };
  }
  // Sunday is 0, as everywhere in QML.
  get firstDayOfWeek() {
    return this.$week().firstDay % 7;
  }
  get weekDays() {
    const weekend = this.$week().weekend;
    return [1, 2, 3, 4, 5, 6, 7].filter((day) => !weekend.includes(day)).map((day) => day % 7);
  }
  get textDirection() {
    const locale = this.$locale;
    return (locale.getTextInfo?.() ?? locale.textInfo)?.direction === "rtl" ? 1 : 0;
  }
  get measurementSystem() {
    const region = this.name === "C" ? "" : this.$locale.region;
    if (region === "GB") return Locale.ImperialUKSystem;
    return region === "US" || region === "LR" || region === "MM" ? Locale.ImperialUSSystem : Locale.MetricSystem;
  }
  get uiLanguages() {
    if (this.name === "C") return ["C"];
    const { language, script, region } = this.$locale;
    return [`${language}-${script}-${region}`, `${language}-${region}`, `${language}-${script}`, language];
  }

  $period(hour) {
    const format = this.$dates({ hour: "numeric", hour12: true });
    return part(format.formatToParts(Date.UTC(2024, 0, 5, hour)), "dayPeriod");
  }
  get amText() {
    return this.$once("am", () => this.$period(6));
  }
  get pmText() {
    return this.$once("pm", () => this.$period(18));
  }

  // The format `Intl` uses, in Qt's letters. A narrow format is the short
  // one, as in Qt.
  $pattern(kind, type) {
    const long = type === Locale.LongFormat;
    if (this.name === "C") return C[kind][long ? 0 : 1];
    return this.$once(`${kind}${long}`, () => {
      const format = this.$dates({ [`${kind}Style`]: long ? "full" : "short" });
      const hour = /^h1/.test(format.resolvedOptions().hourCycle ?? "") ? "h" : "H";
      let out = "";
      for (const { type: field, value } of format.formatToParts(SAMPLE)) {
        const wide = [...value].length > 1;
        if (field === "literal") out += literal(value);
        else if (field === "weekday") out += long ? "dddd" : "ddd";
        else if (field === "day") out += wide ? "dd" : "d";
        else if (field === "month") out += NUMERIC.test(value) ? (wide ? "MM" : "M") : long ? "MMMM" : "MMM";
        else if (field === "year") out += [...value].length === 2 ? "yy" : "yyyy";
        else if (field === "hour") out += wide ? hour + hour : hour;
        else if (field === "minute") out += "mm";
        else if (field === "second") out += "ss";
        else if (field === "dayPeriod") out += "Ap";
        else if (field === "timeZoneName") out += long ? "tttt" : "t";
      }
      return out;
    });
  }
  dateFormat(type = Locale.LongFormat) {
    return this.$pattern("date", type);
  }
  timeFormat(type = Locale.LongFormat) {
    return this.$pattern("time", type);
  }
  dateTimeFormat(type = Locale.LongFormat) {
    return `${this.dateFormat(type)} ${this.timeFormat(type)}`;
  }

  // A month's name as it stands in a date ("5 января") or on its own.
  $name(field, time, type, alone) {
    const width = WIDTHS[type] ?? "long";
    const options = alone ? { [field]: width } : { weekday: field === "weekday" ? width : undefined, day: "numeric", month: field === "month" ? width : "long" };
    const name = part(this.$dates(options).formatToParts(time), field);
    if (!NUMERIC.test(name)) return name;
    // Where a month is a number and a sign ("1月"), its name is both.
    return alone ? this.$dates(options).format(time) : this.$name(field, time, type, true);
  }
  monthName(month, type = Locale.LongFormat) {
    return this.$name("month", Date.UTC(2024, month, 5), type, false);
  }
  standaloneMonthName(month, type = Locale.LongFormat) {
    return this.$name("month", Date.UTC(2024, month, 5), type, true);
  }
  // Sunday is 0, and 7.
  dayName(day, type = Locale.LongFormat) {
    return this.$name("weekday", SUNDAY + (day % 7) * 86400000, type, false);
  }
  standaloneDayName(day, type = Locale.LongFormat) {
    return this.$name("weekday", SUNDAY + (day % 7) * 86400000, type, true);
  }

  // A number, or a date: `toString(1234.5, "f", 2)`, `toString(date, "d MMM")`,
  // `toString(date, Locale.ShortFormat)`.
  toString(value, format, precision) {
    if (value === undefined) return `QLocale(${this.name})`;
    if (value instanceof Date) return formatDateTime(value, format ?? Locale.LongFormat, this, true, true);
    // A whole number is written as one, whatever its size in digits.
    if (format === undefined && Number.isInteger(value) && Math.abs(value) < 2 ** 31) return this.$number(value, "f", 0);
    return this.$number(value, format ?? "g", precision ?? 6);
  }

  $digits(text) {
    const zero = this.zeroDigit.codePointAt(0);
    if (zero === 48) return text;
    return text.replace(/\d/g, (digit) => String.fromCodePoint(zero + Number(digit)));
  }

  $number(value, format, precision) {
    if (!Number.isFinite(value)) return general(value);
    const kind = format.toLowerCase();
    let text;
    // `toFixed` gives up at 1e21, where a number is whole anyway.
    if (kind === "f") text = Math.abs(value) < 1e21 ? value.toFixed(precision) : BigInt(value) + (precision ? `.${"0".repeat(precision)}` : "");
    else if (kind === "e") text = value.toExponential(precision);
    else text = general(value, precision || 1);
    const [, sign, whole, fraction, power] = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(text);
    const grouped = this.$once(`group${this.numberOptions & Locale.OmitGroupSeparator}`, () => {
      // Grouped as the locale does it: not "1.234" in Spain, where four
      // digits stand together.
      const group = !(this.numberOptions & Locale.OmitGroupSeparator);
      return new Intl.NumberFormat(this.$tag, { useGrouping: group ? "auto" : false, maximumFractionDigits: 0 });
    });
    let out = (sign ? this.negativeSign : "") + grouped.format(BigInt(whole));
    if (fraction) out += this.decimalPoint + this.$digits(fraction);
    if (power) out += (format === kind ? "e" : "E") + power[0] + this.$digits(power.slice(1).padStart(2, "0"));
    return out;
  }
}

const made = new Map();

function lookup(name) {
  const tag = name.replace(/[.@].*$/, "").replace(/_/g, "-");
  try {
    const locale = new Intl.Locale(tag).maximize();
    const known = locale.region && Intl.DateTimeFormat.supportedLocalesOf([locale.language]).length > 0;
    if (known) return new LocaleValue(`${locale.language}_${locale.region}`, `${locale.language}-${locale.region}`, locale);
  } catch {
    // Not a locale's name: Qt answers with "C" too.
  }
  return new LocaleValue("C", "en-US", new Intl.Locale("en-US").maximize());
}

// `Qt.locale(name)`: the same value for the same name, so two of them
// compare equal. Without a name, the browser's.
export function locale(name) {
  if (name instanceof LocaleValue) return name;
  const key = name ?? globalThis.navigator?.language ?? "en-US";
  let value = made.get(key);
  if (!value) made.set(key, (value = lookup(String(key))));
  return value;
}

export const isLocale = (value) => value instanceof LocaleValue;

const pad = (value, length) => String(value).padStart(length, "0");

// How many times the character at `at` is repeated from there.
function run(format, at) {
  let end = at + 1;
  while (end < format.length && format[end] === format[at]) end++;
  return end - at;
}

// A quoted stretch, from its opening quote: what it says and where it ends.
// `''` is a quote, inside or outside one.
function quoted(format, at) {
  at++;
  if (format[at] === "'") return ["'", at + 1];
  let text = "";
  while (at < format.length) {
    if (format[at] !== "'") text += format[at++];
    else if (format[at + 1] === "'") {
      text += "'";
      at += 2;
    } else break;
  }
  return [text, at + 1];
}

// The fields of a Qt format string: `[letter, count]`, or a string to write
// as it is. `dddd d` is ["d", 4], " ", ["d", 1]; `yyy` is ["y", 2], "y".
const LIMITS = { M: 4, d: 4, h: 2, H: 2, m: 2, s: 2, z: 3, t: 4 };
const parsedFormats = new Map();

function fields(format, dates, times) {
  const key = `${dates ? 1 : 0}${times ? 1 : 0}${format}`;
  let out = parsedFormats.get(key);
  if (out) return out;
  out = [];
  // Twelve hours when the format says which half of the day it is.
  out.halves = false;
  let text = "";
  const push = (field) => {
    if (text) out.push(text);
    text = "";
    out.push(field);
  };
  for (let at = 0; at < format.length; ) {
    const letter = format[at];
    if (letter === "'") {
      const [said, end] = quoted(format, at);
      text += said;
      at = end;
      continue;
    }
    let count = run(format, at);
    if (dates && letter === "y" && count >= 2) push(["y", (count = count >= 4 ? 4 : 2)]);
    else if (dates && (letter === "M" || letter === "d")) push([letter, (count = Math.min(count, 4))]);
    else if (times && (letter === "a" || letter === "A")) {
      const next = format[at + 1];
      count = next === "p" || next === "P" ? 2 : 1;
      // "AP" and "ap" set the case; "Ap" and "aP" leave it to the locale.
      const upper = letter === "A" && (count === 1 || next === "P");
      const lower = letter === "a" && (count === 1 || next === "p");
      push(["a", upper ? 1 : lower ? -1 : 0]);
      out.halves = true;
    } else if (times && letter in LIMITS && letter !== "M" && letter !== "d") push([letter, (count = Math.min(count, LIMITS[letter]))]);
    else text += letter.repeat(count);
    at += count;
  }
  if (text) out.push(text);
  if (parsedFormats.size >= 256) parsedFormats.clear();
  parsedFormats.set(key, out);
  return out;
}

function zone(date, style, where) {
  const offset = -date.getTimezoneOffset();
  if (style === 2 || style === 3) {
    const sign = offset < 0 ? "-" : "+";
    const hours = pad(Math.trunc(Math.abs(offset) / 60), 2);
    return `${sign}${hours}${style === 3 ? ":" : ""}${pad(Math.abs(offset) % 60, 2)}`;
  }
  const format = new Intl.DateTimeFormat(where.$tag, { timeZoneName: style === 4 ? "long" : "short" });
  return part(format.formatToParts(date), "timeZoneName");
}

function write(date, format, where, dates, times) {
  const all = fields(format, dates, times);
  // In the locale's own digits, as Qt writes a date.
  const pad = (value, length) => where.$digits(String(value).padStart(length, "0"));
  let out = "";
  for (const field of all) {
    if (typeof field === "string") {
      out += field;
      continue;
    }
    const [letter, count] = field;
    switch (letter) {
      case "y":
        out += count === 4 ? pad(date.getFullYear(), 4) : pad(date.getFullYear() % 100, 2);
        break;
      case "M":
        if (count <= 2) out += pad(date.getMonth() + 1, count);
        else out += where.monthName(date.getMonth(), count === 4 ? Locale.LongFormat : Locale.ShortFormat);
        break;
      case "d":
        if (count <= 2) out += pad(date.getDate(), count);
        else out += where.dayName(date.getDay(), count === 4 ? Locale.LongFormat : Locale.ShortFormat);
        break;
      case "h": {
        const hour = date.getHours();
        out += pad(all.halves ? hour % 12 || 12 : hour, count);
        break;
      }
      case "H":
        out += pad(date.getHours(), count);
        break;
      case "m":
        out += pad(date.getMinutes(), count);
        break;
      case "s":
        out += pad(date.getSeconds(), count);
        break;
      case "z": {
        // A fraction of a second: "045", and "5" for half a second unless
        // all three digits are asked for.
        const digits = String(date.getMilliseconds()).padStart(3, "0");
        out += where.$digits(count === 3 ? digits : digits.replace(/0+$/, "") || "0");
        break;
      }
      case "a": {
        const text = date.getHours() < 12 ? where.amText : where.pmText;
        out += count > 0 ? text.toUpperCase() : count < 0 ? text.toLowerCase() : text;
        break;
      }
      case "t":
        out += zone(date, count, where);
        break;
    }
  }
  return out;
}

// Qt::DateFormat's own formats, which are English whatever the locale.
const TEXT = 0;
const ISO = 1;
const RFC2822 = 8;
const ISO_MS = 9;

function standard(date, format, dates, times) {
  const c = locale("C");
  const both = dates && times;
  if (format === ISO || format === ISO_MS) {
    const time = format === ISO_MS ? "HH:mm:ss.zzz" : "HH:mm:ss";
    return write(date, both ? `yyyy-MM-dd'T'${time}` : dates ? "yyyy-MM-dd" : time, c, dates, times);
  }
  if (format === RFC2822) return write(date, both ? "dd MMM yyyy HH:mm:ss tt" : dates ? "dd MMM yyyy" : "HH:mm:ss", c, dates, times);
  if (format !== TEXT) throw new Error(`Invalid date format ${format}`);
  return write(date, both ? "ddd MMM d HH:mm:ss yyyy" : dates ? "ddd MMM d yyyy" : "HH:mm:ss", c, dates, times);
}

// A date written by a locale: with a format string, or in the locale's long
// or short format.
export function formatDateTime(date, format, where, dates, times) {
  if (Number.isNaN(date.getTime())) return "";
  if (typeof format !== "string") {
    format = dates && times ? where.dateTimeFormat(format) : dates ? where.dateFormat(format) : where.timeFormat(format);
  }
  return write(date, format, where, dates, times);
}

const ISO_DATE = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d)(?::(\d\d)(?:\.(\d{1,3})\d*)?)?(Z|[+-]\d\d:?\d\d)?)?$/;
const ISO_TIME = /^(\d\d):(\d\d)(?::(\d\d)(?:\.(\d{1,3})\d*)?)?$/;

// What `Qt.formatDate` and its kin take for a date: a Date, or a string in
// ISO 8601. Without a zone it is the time here, date and all.
function dateOf(value, name, times) {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const date = ISO_DATE.exec(value);
    if (date?.[8]) return new Date(value);
    if (date) {
      const [, year, month, day, hour = 0, minute = 0, second = 0, fraction = "0"] = date;
      return new Date(+year, month - 1, +day, +hour, +minute, +second, +fraction.padEnd(3, "0"));
    }
    const time = times && ISO_TIME.exec(value);
    if (time) return new Date(1970, 0, 1, +time[1], +time[2], +(time[3] ?? 0), +(time[4] ?? "0").padEnd(3, "0"));
  }
  throw new Error(`Invalid argument passed to ${name}(): ${typeof value === "string" ? value : typeof value}`);
}

// `Qt.formatDateTime(date, format)`: the format is a string of Qt's, one of
// Qt.TextDate, Qt.ISODate, Qt.RFC2822Date, or a locale and how long.
const formatter = (name, dates, times) =>
  function (value, format, type) {
    const date = dateOf(value, name, times);
    if (Number.isNaN(date.getTime())) return "";
    if (typeof format === "number") return standard(date, format, dates, times);
    if (isLocale(format)) return formatDateTime(date, type ?? Locale.ShortFormat, format, dates, times);
    return formatDateTime(date, format ?? Locale.ShortFormat, locale(), dates, times);
  };

export const formatDate = formatter("formatDate", true, false);
export const formatTime = formatter("formatTime", false, true);
export const formatDateTimeOf = formatter("formatDateTime", true, true);

const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
const names = (make, count) => Array.from({ length: count }, (_, index) => make(index));

// A date read back from what a format wrote. Not a date at all when the
// text does not fit.
function read(text, format, where, dates, times) {
  if (typeof format !== "string") {
    format = dates && times ? where.dateTimeFormat(format) : dates ? where.dateFormat(format) : where.timeFormat(format);
  }
  const takers = [];
  let pattern = "";
  const take = (source, taker) => {
    pattern += `(${source})`;
    takers.push(taker);
  };
  const found = { year: 1900, month: 0, day: 1, hour: 0, minute: 0, second: 0, ms: 0, pm: null };
  const number = (key, offset = 0) => (value) => void (found[key] = Number(value) + offset);
  const named = (list, key) => (value) => {
    const index = list.findIndex((name) => name.toLowerCase() === value.toLowerCase());
    if (key) found[key] = index;
  };
  for (const field of fields(format, dates, times)) {
    if (typeof field === "string") {
      pattern += escaped(field);
      continue;
    }
    const [letter, count] = field;
    const digits = count === 2 ? "\\d{2}" : "\\d{1,2}";
    if (letter === "y") take(count === 4 ? "\\d{4}" : "\\d{2}", number("year", count === 4 ? 0 : 1900));
    else if (letter === "M" && count <= 2) take(digits, number("month", -1));
    else if (letter === "M") {
      const list = names((index) => where.monthName(index, count === 4 ? 0 : 1), 12);
      take(list.map(escaped).join("|"), named(list, "month"));
    } else if (letter === "d" && count <= 2) take(digits, number("day"));
    else if (letter === "d") {
      const list = names((index) => where.dayName(index, count === 4 ? 0 : 1), 7);
      take(list.map(escaped).join("|"), named(list));
    } else if (letter === "h" || letter === "H") take(digits, number("hour"));
    else if (letter === "m") take(digits, number("minute"));
    else if (letter === "s") take(digits, number("second"));
    else if (letter === "z") take(count === 3 ? "\\d{3}" : "\\d{1,3}", (value) => void (found.ms = Number(value.padEnd(3, "0"))));
    else if (letter === "a") {
      const list = [where.amText, where.pmText];
      take(list.map(escaped).join("|"), (value) => void (found.pm = value.toLowerCase() === list[1].toLowerCase()));
    } else take(".*?", () => {});
  }
  const match = new RegExp(`^\\s*${pattern}\\s*$`, "iu").exec(text.replace(/[  ]/g, " "));
  if (!match) return new Date(NaN);
  takers.forEach((taker, index) => taker(match[index + 1]));
  if (found.pm !== null) found.hour = (found.hour % 12) + (found.pm ? 12 : 0);
  if (!dates) {
    // A time alone is today's.
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate(), found.hour, found.minute, found.second, found.ms);
  }
  return new Date(found.year, found.month, found.day, found.hour, found.minute, found.second, found.ms);
}

// A number read back from how a locale writes one.
function number(where, text) {
  if (text === undefined) [where, text] = [locale(), where];
  const zero = where.zeroDigit.codePointAt(0);
  let plain = "";
  for (const each of String(text).trim()) {
    const digit = each.codePointAt(0) - zero;
    if (digit >= 0 && digit <= 9) plain += digit;
    else if (each === where.decimalPoint) plain += ".";
    else if (each === where.negativeSign || each === "-") plain += "-";
    else if (each === where.positiveSign || each === "+") plain += "+";
    else if (each === "e" || each === "E" || each === where.exponential) plain += "e";
    else if (each !== where.groupSeparator && !/\s/u.test(each)) plain = "x";
  }
  const value = plain === "" ? NaN : Number(plain);
  if (Number.isNaN(value)) throw new Error("Locale: Number.fromLocaleString(): Invalid format");
  return value;
}

// QML adds a locale to JavaScript's own `toLocaleString` and its kin:
// `date.toLocaleDateString(Qt.locale(), Locale.ShortFormat)`. Given a locale
// of ours they answer as Qt does, and given `Locale.ShortFormat` alone (which
// no browser takes) with the short format, as Qt does too. A date given
// nothing at all is written out in full, as Qt writes it. Anything else is
// the browser's business as before.
const PATCHED = Symbol.for("ljos-web.locale");

function extend(target, name, ours, takes) {
  const original = target[name];
  if (original?.[PATCHED]) return;
  const method = function (...args) {
    if (takes(args[0], args.length) || !original) return ours(this, ...args);
    return original.apply(this, args);
  };
  method[PATCHED] = true;
  Object.defineProperty(target, name, { value: method, writable: true, configurable: true, enumerable: false });
}

const ourDate = (first, given) => given === 0 || isLocale(first) || typeof first === "number";
const dateMethod =
  (dates, times) =>
  (date, ...given) =>
    isLocale(given[0])
      ? formatDateTime(date, given[1] ?? Locale.LongFormat, given[0], dates, times)
      : formatDateTime(date, given.length === 0 ? Locale.LongFormat : Locale.ShortFormat, locale(), dates, times);

extend(Date.prototype, "toLocaleString", dateMethod(true, true), ourDate);
extend(Date.prototype, "toLocaleDateString", dateMethod(true, false), ourDate);
extend(Date.prototype, "toLocaleTimeString", dateMethod(false, true), ourDate);
extend(Date, "fromLocaleString", (_, where, text, format = Locale.LongFormat) => read(text, format, where, true, true), isLocale);
extend(Date, "fromLocaleDateString", (_, where, text, format = Locale.LongFormat) => read(text, format, where, true, false), isLocale);
extend(Date, "fromLocaleTimeString", (_, where, text, format = Locale.LongFormat) => read(text, format, where, false, true), isLocale);
extend(Number.prototype, "toLocaleString", (value, where, format = "f", precision = 2) => where.$number(Number(value), format, precision), isLocale);
extend(Number, "fromLocaleString", (_, where, text) => number(where, text), () => true);

// `amount.toLocaleCurrencyString(Qt.locale(), "kr")`. Given no locale Qt
// writes no currency at all, only the number as the locale here writes one.
function currency(value, ...given) {
  if (given.length === 0) return locale().$number(Number(value), "g", 6);
  if (given.length > 2 || !isLocale(given[0])) throw new Error("Locale: Number.toLocaleCurrencyString(): Invalid arguments");
  // The message is Qt's, which names the wrong function.
  if (given.length === 2 && typeof given[1] !== "string") throw new Error("Locale: Number.toLocaleString(): Invalid arguments");
  return given[0].$amount(Number(value), given[1]);
}

extend(Number.prototype, "toLocaleCurrencyString", currency, () => true);
