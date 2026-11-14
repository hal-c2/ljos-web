// How an arrangement shares its size among its rows or columns, one axis
// at a time, and which cell of a Grid each child sits in: ljos-ui's
// `layouts/distribute.rs` and `layouts/place.rs`, step for step, so that
// a file is laid out to the same pixel on both.
//
// A track is one row or column: `{ min, pref, max, stretch, used, open }`.
// `used` is false for one nothing sits in, which takes no size and no
// spacing; `open` for one only spanning children cover.

// Placed on whole pixels, a half rounded up.
export const roundHalfUp = (value) => Math.floor(value + 0.5);

const empty = () => ({ min: 0, pref: 0, max: 0, stretch: -1, used: false, open: false });
const sum = (values) => values.reduce((total, value) => total + value, 0);

// The tracks `count` rows or columns need for `items`
// (`{ start, len, min, pref, max, stretch }`, margins included).
//
// A track is as small as its largest minimum, prefers its largest
// preferred size and can grow as far as its most generous child. Tracks
// that only spanning children cover count as one per run. A child that
// spans several and does not fit makes them grow as `distribute` would.
export function tracks(count, items, spacing) {
  const t = Array.from({ length: count }, empty);
  const covered = new Array(count).fill(false);
  const starts = new Array(count).fill(false);
  // A spanning child without a maximum lets the tracks under it grow.
  const unbounded = new Array(count).fill(false);
  for (const s of items) {
    const end = Math.min(s.start + s.len, count);
    for (let i = s.start; i < end; i++) {
      covered[i] = true;
      unbounded[i] ||= s.len > 1 && s.max === Infinity;
    }
    if (s.start < count) starts[s.start] = true;
    if (s.len === 1 && s.start < count) {
      const k = t[s.start];
      k.used = true;
      k.min = Math.max(k.min, s.min);
      k.pref = Math.max(k.pref, s.pref);
      k.max = Math.max(k.max, s.max);
      k.stretch = Math.max(k.stretch, s.stretch);
    }
  }
  // A run of tracks with no child of their own is one track, kept in the
  // run's first; one where a spanning child starts begins a new run, so
  // that two such children side by side do not overlap.
  const own = t.map((k) => k.used);
  let run = null;
  for (let i = 0; i < count; i++) {
    if (own[i]) {
      run = null;
    } else if (covered[i]) {
      let first = run;
      if (run === null || starts[i]) {
        t[i].used = true;
        t[i].open = !starts[i];
        run = first = i;
      }
      if (unbounded[i]) t[first].max = Infinity;
    }
  }
  // Short spans first: a long one then sees what they already asked for.
  const spanning = items.filter((s) => s.len > 1).sort((a, b) => a.len - b.len);
  for (const s of spanning) {
    const end = Math.min(s.start + s.len, count);
    const at = [];
    for (let i = s.start; i < end; i++) if (t[i].used) at.push(i);
    if (!at.length) continue;
    const gaps = spacing * (at.length - 1);
    widenPref(t, at, own, s.pref - gaps);
    widenMin(t, at, s.min - gaps);
  }
  for (const k of t) {
    k.pref = Math.max(k.pref, k.min);
    k.max = Math.max(k.max, k.pref);
  }
  return t;
}

// Makes the tracks `at` prefer `want` together: they grow as they would in
// that room, except that one with no child of its `own` takes whatever is
// asked of it.
function widenPref(t, at, own, want) {
  const have = sum(at.map((i) => t[i].pref));
  if (want <= have) return;
  const part = at.map((i) => (own[i] ? t[i] : { ...t[i], max: Infinity }));
  const sizes = part.map((k) => k.pref);
  const left = fillUp(part, sizes, want - have);
  // Nothing could take it (no track has a size at all): equal parts.
  at.forEach((i, index) => {
    t[i].pref = sizes[index] + left / at.length;
  });
}

// Makes the tracks `at` at least `want` wide together: each takes the part
// of it its preferred size is of the whole, never less than its own
// minimum and never more than its preferred size.
function widenMin(t, at, want) {
  const have = sum(at.map((i) => t[i].min));
  if (want <= have) return;
  const weight = sum(at.map((i) => t[i].pref));
  for (const i of at) {
    const k = t[i];
    const share = weight > 0 ? (want * k.pref) / weight : want / at.length;
    k.min = Math.min(Math.max(k.min, share), Math.max(k.pref, k.min));
  }
}

// The least, the preferred and the most of the whole axis: the used tracks
// and the spacing between them.
export function total(t, spacing) {
  const used = t.filter((k) => k.used);
  const gaps = spacing * Math.max(used.length - 1, 0);
  return {
    min: sum(used.map((k) => k.min)) + gaps,
    pref: sum(used.map((k) => k.pref)) + gaps,
    max: sum(used.map((k) => k.max)) + gaps,
  };
}

// The size of every track when the axis is `size` long. No more room than
// the minimums: each at its minimum. Less than the preferred sizes: each
// gives up some of what it prefers. More: those that can grow share it.
export function distribute(t, spacing, size) {
  const used = t.filter((k) => k.used);
  const avail = size - spacing * Math.max(used.length - 1, 0);
  const min = sum(used.map((k) => k.min));
  const pref = sum(used.map((k) => k.pref));
  if (avail <= min) return t.map((k) => (k.used ? k.min : 0));
  if (avail < pref) return shrink(t, avail, min, pref);
  const sizes = t.map((k) => (k.used ? k.pref : 0));
  if (avail > pref) fillUp(t, sizes, avail - pref);
  return sizes;
}

// Adds `surplus` to `sizes`, which start at the preferred sizes, by
// stretch factor where there are any, then by preferred size. Returns what
// no track could take.
function fillUp(t, sizes, surplus) {
  const stretch = stretchWeights(t);
  if (stretch.some((w) => w > 0)) surplus = grow(t, sizes, stretch, surplus);
  const even = t.some((k) => k.used && k.open && k.max > k.pref);
  // A track with no preferred size still gets a share.
  surplus = grow(
    t,
    sizes,
    t.map((k) => (even ? 1 : Math.max(k.pref, 1))),
    surplus,
  );
  const max = sum(t.filter((k) => k.used).map((k) => k.max));
  if (surplus > 0 && max > 0 && Number.isFinite(max)) {
    t.forEach((k, i) => {
      if (k.used) sizes[i] += (surplus * k.max) / max;
    });
    return 0;
  }
  return surplus;
}

// Sizes between the minimums and the preferred sizes: a track that can
// give `r` of the `R` all can give keeps `r * t^(r / R)` of it, `t` the
// share of `R` there is room for, scaled so that the whole fits.
function shrink(t, avail, min, pref) {
  const give = pref - min;
  const room = avail - min;
  const share = room / give;
  const kept = t.map((k) => {
    const r = k.used ? k.pref - k.min : 0;
    return r > 0 ? r * share ** (r / give) : 0;
  });
  const whole = sum(kept);
  return t.map((k, i) => {
    if (!k.used) return 0;
    return whole > 0 ? k.min + (room * kept[i]) / whole : k.min;
  });
}

// The share of the surplus each stretching track takes: with factors `s`,
// preferred sizes `p` and `q` the largest `p / s`, `3 s q - 2 p`.
function stretchWeights(t) {
  const stretching = (k) => k.used && k.stretch > 0 && k.max > k.pref;
  let q = 0;
  for (const k of t) if (stretching(k)) q = Math.max(q, k.pref / k.stretch);
  return t.map((k) => {
    if (!stretching(k)) return 0;
    return q > 0 ? 3 * k.stretch * q - 2 * k.pref : k.stretch;
  });
}

// Shares `surplus` by `weights` among tracks below their maximum; one that
// reaches it drops out and the others share the rest. Returns what nobody
// could take.
function grow(t, sizes, weights, surplus) {
  let active = [];
  t.forEach((k, i) => {
    if (k.used && weights[i] > 0 && k.max > sizes[i]) active.push(i);
  });
  while (surplus > 0 && active.length) {
    const weight = sum(active.map((i) => weights[i]));
    const full = active.filter((i) => sizes[i] + (surplus * weights[i]) / weight >= t[i].max);
    if (!full.length) {
      for (const i of active) sizes[i] += (surplus * weights[i]) / weight;
      return 0;
    }
    for (const i of full) {
      surplus -= t[i].max - sizes[i];
      sizes[i] = t[i].max;
    }
    active = active.filter((i) => !full.includes(i));
  }
  return Math.max(surplus, 0);
}

// Where every track starts and ends, on whole pixels.
export function edges(t, sizes, spacing) {
  let at = 0;
  return t.map((k, i) => {
    if (!k.used) return [roundHalfUp(at), roundHalfUp(at)];
    const edge = [roundHalfUp(at), roundHalfUp(at + sizes[i])];
    at += sizes[i] + spacing;
    return edge;
  });
}

// Which cell each child sits in (`wants`: `{ row, column, rowSpan,
// columnSpan }`, a row or column undefined when not named). A child goes
// into the next free cell after the one before it, along the flow, across
// a row until `columns` are full, or down a column until `rows` are; one
// that names its row or column sits there, and the next follows it.
export function place(wants, rows, columns, topToBottom) {
  const bound = topToBottom ? rows : columns;
  const limit = bound > 0 ? bound : Infinity;
  const taken = new Set();
  const key = (line, at) => `${line},${at}`;
  let line = 0;
  let at = 0;
  return wants.map((w) => {
    const [wantLine, wantAt, wide, long] = topToBottom
      ? [w.column, w.row, w.columnSpan, w.rowSpan]
      : [w.row, w.column, w.rowSpan, w.columnSpan];
    const along = Math.min(Math.max(long, 1), limit);
    const across = Math.max(wide, 1);
    if (wantLine !== undefined || wantAt !== undefined) {
      line = wantLine ?? 0;
      at = wantAt ?? 0;
    } else {
      for (;;) {
        if (at > 0 && at + along > limit) {
          line += 1;
          at = 0;
        }
        let free = true;
        for (let l = line; free && l < line + across; l++) {
          for (let a = at; free && a < at + along; a++) free = !taken.has(key(l, a));
        }
        if (free) break;
        at += 1;
      }
    }
    for (let l = line; l < line + across; l++) for (let a = at; a < at + along; a++) taken.add(key(l, a));
    const slot = topToBottom
      ? { row: at, column: line, rowSpan: along, columnSpan: across }
      : { row: line, column: at, rowSpan: across, columnSpan: along };
    at += along;
    return slot;
  });
}
