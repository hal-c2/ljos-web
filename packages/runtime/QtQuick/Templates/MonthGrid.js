// What a style lays a calendar out with: AbstractDayOfWeekRow, the names of
// the days of a week; AbstractMonthGrid, the six weeks a month is shown in;
// and AbstractWeekNumberColumn, the numbers of those weeks. Each has a
// `source`, the model the style's Repeater makes the `delegate` for, and
// makes the cells as big as there is room for.
import { onCleanup, runWithOwner } from "solid-js";
import { defineType, derived, effect, last, settle, slot } from "../../object.js";
import { styleHints } from "../../QtQml/application.js";
import { Locale } from "../../QtQml/locale.js";
import { LeftButton } from "../keycodes.js";
import { AbstractListModel } from "../model.js";
import { after, cancel } from "../pointer.js";
import { day } from "./Calendar.js";
import { Control } from "./Control.js";
import { close } from "./Slider.js";
import { signal, untrack } from "#kernel";

const WEEKS = 6;
const DAYS = 7;

// The model a control is the `source` of, made when it is first asked for.
// Its rows are always there: what a row says is read from the control, and
// changes as the control does.
function model(self, roles, count, row) {
  return (self.$source ??= runWithOwner(self.$owner, () =>
    untrack(() => {
      const made = AbstractListModel({});
      made.$roles = roles;
      made.$elements = Array.from({ length: count }, (_, index) => row(self, index));
      return made;
    }),
  ));
}

// The week a date is in, as ISO 8601 counts them: the one with the first
// Thursday of the year is the first.
function week(date) {
  const thursday = new Date(0);
  thursday.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  thursday.setUTCDate(thursday.getUTCDate() - ((thursday.getUTCDay() + 6) % 7) + 3);
  const first = new Date(0);
  first.setUTCFullYear(thursday.getUTCFullYear(), 0, 1);
  return 1 + Math.floor((thursday - first) / 86400000 / 7);
}

// The days that are shown of a month begin with the first day of a week,
// and never with the first of the month: there is always something of the
// month before.
function dateAt(self, index) {
  const { month, year } = self;
  const before = (day(year, month, 1).getDay() - self.locale.firstDayOfWeek + DAYS) % DAYS || DAYS;
  return day(year, month, 1 - before + index);
}

const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const dayOfMonth = (self, index) => ({
  get date() {
    return dateAt(self, index);
  },
  get day() {
    return dateAt(self, index).getDate();
  },
  get today() {
    return same(dateAt(self, index), new Date());
  },
  get weekNumber() {
    return week(dateAt(self, index));
  },
  get month() {
    return dateAt(self, index).getMonth();
  },
  get year() {
    return dateAt(self, index).getFullYear();
  },
});

const weekOfMonth = (self, index) => ({
  get weekNumber() {
    return week(dateAt(self, index * DAYS));
  },
});

// Sunday is 0, as in a JavaScript date.
const dayAt = (self, index) => (self.locale.firstDayOfWeek + index) % DAYS;

const dayOfWeek = (self, index) => ({
  get day() {
    return dayAt(self, index);
  },
  get longName() {
    return self.locale.standaloneDayName(dayAt(self, index), Locale.LongFormat);
  },
  get shortName() {
    return self.locale.standaloneDayName(dayAt(self, index), Locale.ShortFormat);
  },
  get narrowName() {
    return self.locale.standaloneDayName(dayAt(self, index), Locale.NarrowFormat);
  },
});

// What the content item has that is a cell: a Repeater is not one.
const cellsOf = (item) => item.children.filter((child) => !child.$siblings);

// Every cell is as big as its share of the content item, the spacing taken
// off. As in Qt that is done when the control's size or its padding changes
// and not when its spacing does: the spacing is what it was by then.
function share(self, across, down) {
  untrack(() => {
    const item = self.contentItem;
    if (!item) return;
    const spacing = self.spacing;
    const wide = (self.availableWidth - (across - 1) * spacing) / across;
    const high = (self.availableHeight - (down - 1) * spacing) / down;
    // A share that differs by what the division lost is the same.
    for (const cell of cellsOf(item)) {
      if (!close(cell.width, wide)) slot(cell, "width").place(wide);
      if (!close(cell.height, high)) slot(cell, "height").place(high);
    }
  });
}

// The cells of a content item that was just made are there before what
// places them has counted them, and how big the control is comes from that,
// and from the layout it may be in: they are shared out once all of that has
// settled, as Qt does it once the control is complete.
//
// A row is as high as its cells, and its cells as high as the row. A layout
// gives the row what it asked for a moment ago: when its padding changes it
// is given what the cells were, while the cells are given what the row was,
// and then each the other's again, for ever. Qt shares out before a layout
// looks, so that is done here at once; what the layout makes of the control
// meanwhile is looked at when it has settled.
function shares(self, across, down) {
  const [seen, see] = signal(null, self.$owner);
  let found = [];
  let settled = true;
  let again = false;
  // What waits for the rest to settle may find the control gone by then.
  let gone = false;
  onCleanup(() => void (gone = true));
  effect(
    () => {
      const item = self.contentItem;
      if (!item || seen() !== item) return [item];
      return [item, self.availableWidth, self.availableHeight, self.leftPadding, self.topPadding, ...cellsOf(item)];
    },
    (next) => {
      if (next.length === 1) {
        const item = next[0];
        if (item)
          last(() => {
            if (gone) return;
            see(item);
            settle();
          });
        return;
      }
      // Asked again is not changed: the spacing alone leaves them be.
      if (next.length === found.length && next.every((each, index) => each === found[index])) return;
      found = next;
      if (!settled) return void (again = true);
      settled = false;
      share(self, across, down);
      last(() => {
        settled = true;
        if (!again || gone) return;
        again = false;
        share(self, across, down);
        settle();
      });
    },
  );
}

const MONTHS = [0, 11];
const YEARS = [-271820, 275759];

// A month or a year that is none is refused: the property stays what it
// was, and Qt says so.
function ranged(self, type, name, [low, high]) {
  const held = slot(self, name);
  let given;
  effect(
    () => held.asked(),
    (value) => {
      // Said once of what was given, however often it is asked for.
      if (value === given) return;
      given = value;
      if (value >= low && value <= high) self.$shown[name] = value;
      else console.warn(`${type}: ${name} ${value} is out of range [${low}...${high}]`);
    },
  );
}

const within = (value, [low, high]) => (value >= low && value <= high ? value : undefined);

// The month and the year that are shown: this month's until they are given.
const shown = {
  properties: {
    month: derived(() => new Date().getMonth()),
    year: derived(() => new Date().getFullYear()),
  },
  resolve: {
    month: (self, own) => within(own(), MONTHS) ?? self.$shown?.month ?? new Date().getMonth(),
    year: (self, own) => within(own(), YEARS) ?? self.$shown?.year ?? new Date().getFullYear(),
  },
};

function showing(self, type) {
  self.$shown = { month: new Date().getMonth(), year: new Date().getFullYear() };
  ranged(self, type, "month", MONTHS);
  ranged(self, type, "year", YEARS);
}

export const AbstractDayOfWeekRow = defineType("AbstractDayOfWeekRow", Control, {
  properties: {
    source: derived((self) => model(self, ["day", "longName", "shortName", "narrowName"], DAYS, dayOfWeek)),
    delegate: null,
  },
  setup(self) {
    shares(self, DAYS, 1);
  },
});

export const AbstractWeekNumberColumn = defineType("AbstractWeekNumberColumn", Control, {
  properties: {
    ...shown.properties,
    source: derived((self) => model(self, ["weekNumber"], WEEKS, weekOfMonth)),
    delegate: null,
  },
  resolve: shown.resolve,
  setup(self) {
    showing(self, "AbstractWeekNumberColumn");
    shares(self, 1, WEEKS);
  },
});

// The cell of the grid a point of it is in, and the day that cell shows.
function cellAt(self, x, y) {
  return untrack(() => {
    const item = self.contentItem;
    if (!item) return null;
    const point = self.mapToItem(item, x, y);
    const cell = item.childAt(point.x, point.y);
    const index = cell ? cellsOf(item).indexOf(cell) : -1;
    return index >= 0 && index < WEEKS * DAYS ? dateAt(self, index) : null;
  });
}

// Qt's `clearPress` and `updatePress`: the day that is pressed is let go
// and the one under the point pressed, at every move.
function clearPress(self, clicked) {
  const mine = self.$grid;
  const date = mine.pressed;
  mine.pressed = null;
  if (!date) return;
  self.released(date);
  if (clicked) self.clicked(date);
}

function updatePress(self, x, y) {
  const mine = self.$grid;
  clearPress(self, false);
  mine.pressed = cellAt(self, x, y);
  if (mine.pressed) self.pressed(mine.pressed);
}

// Held is the day that is pressed when the time is up, wherever the press
// began.
function held(self) {
  const date = self.$grid.pressed;
  if (date) self.pressAndHold(date);
}

export const AbstractMonthGrid = defineType("AbstractMonthGrid", Control, {
  properties: {
    ...shown.properties,
    source: derived((self) =>
      model(self, ["date", "day", "today", "weekNumber", "month", "year"], WEEKS * DAYS, dayOfMonth),
    ),
    title: derived((self) => `${self.locale.standaloneMonthName(self.month)} ${self.year}`),
    delegate: null,
    // Tab stops at a grid, though a click does not give it focus.
    focusPolicy: 1,
  },
  resolve: shown.resolve,
  signals: ["pressed", "released", "clicked", "pressAndHold"],
  methods: {
    $accepts: LeftButton,
    $handlePress(x, y) {
      const mine = this.$grid;
      updatePress(this, x, y);
      if (mine.pressed) mine.hold = after(styleHints().mousePressAndHoldInterval, () => held(this), mine.hold);
    },
    $handleMove(x, y) {
      updatePress(this, x, y);
    },
    $handleRelease() {
      clearPress(this, true);
      cancel(this.$grid.hold);
    },
    $handleUngrab() {
      clearPress(this, false);
      cancel(this.$grid.hold);
    },
  },
  setup(self) {
    const mine = (self.$grid = { pressed: null, hold: undefined });
    showing(self, "AbstractMonthGrid");
    shares(self, DAYS, WEEKS);
    onCleanup(() => cancel(mine.hold));
  },
});
