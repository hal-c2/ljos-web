// Calendar: the months by name, `Calendar.January` being 0 as a month of a
// JavaScript date is. And CalendarModel: a row for every month between two
// dates, each with the `month` and the `year` it is.
import { defineType, effect, QtObject, slot } from "../../object.js";
import { AbstractListModel, reset } from "../model.js";
import { untrack } from "#kernel";

const Month = {
  January: 0,
  February: 1,
  March: 2,
  April: 3,
  May: 4,
  June: 5,
  July: 6,
  August: 7,
  September: 8,
  October: 9,
  November: 10,
  December: 11,
};

export const Calendar = defineType("Calendar", QtObject, { enums: Month });

// A day here, at the midnight it begins with. A year before 100 is that
// year, which `new Date(year, ...)` would not have it be.
export function day(year, month, date) {
  const made = new Date(2000, 0, 1);
  made.setFullYear(year, month, date);
  return made;
}

// A date of the model is a day: the day the date it is given is here, and
// read back as the midnight that day begins with in Greenwich, which is how
// Qt hands a QDate to JavaScript.
function dated(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return new Date(NaN);
  const made = new Date(0);
  made.setUTCFullYear(value.getFullYear(), value.getMonth(), value.getDate());
  return made;
}

// The same day is the same date, so that one asked for again has not
// changed.
function held(self, name, value) {
  const dates = (self.$dates ??= {});
  const made = dated(value);
  const last = dates[name];
  return last && Object.is(last.getTime(), made.getTime()) ? last : (dates[name] = made);
}

// How many months there are from the month of one date to the month of
// another: none when the second is before the first, or either is no date.
function between(from, to) {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
  return months < 0 ? 0 : months + 1;
}

// The month `index` months after the first, counted from the year 0.
function monthAfter(self, index) {
  const from = self.from;
  return Number.isNaN(from.getTime()) ? null : from.getUTCFullYear() * 12 + from.getUTCMonth() + index;
}

const whole = (key) => typeof key === "string" && /^\d+$/.test(key);

// The rows of the model. With no dates given there are three million of
// them, from the first day Qt has to the last: a row is made when it is
// asked for.
function rows(self, count) {
  const row = (index) => ({
    get month() {
      return self.monthAt(index);
    },
    get year() {
      return self.yearAt(index);
    },
  });
  return new Proxy(new Array(count), {
    get: (made, key, receiver) => (whole(key) && key < count ? (made[key] ??= row(Number(key))) : Reflect.get(made, key, receiver)),
    has: (made, key) => (whole(key) ? key < count : key in made),
  });
}

export const CalendarModel = defineType("CalendarModel", AbstractListModel, {
  properties: { from: day(1, 0, 1), to: day(275759, 8, 25), count: 0 },
  resolve: {
    from: (self, own) => held(self, "from", own()),
    to: (self, own) => held(self, "to", own()),
  },
  methods: {
    monthAt(index) {
      const month = monthAfter(this, index);
      return month === null ? -1 : ((month % 12) + 12) % 12;
    },
    yearAt(index) {
      const month = monthAfter(this, index);
      return month === null ? 0 : Math.floor(month / 12);
    },
    // Of a date, or of a year and a month. It does not ask whether the date
    // is before the last, as Qt does not.
    indexOf(year, month) {
      return between(this.from, dated(month === undefined ? year : day(year, month, 1))) - 1;
    },
  },
  setup(self) {
    self.$roles = ["month", "year"];
    // The rows are counted when the model is complete and when a date is
    // given after. A row reads the first date itself: one that stays says
    // what it is by then.
    effect(
      () => between(self.from, self.to),
      (count) => {
        if (count === self.$elements.length) return;
        untrack(() => reset(self, rows(self, count)));
        slot(self, "count").write(count);
      },
    );
  },
});
