.pragma library
// What the site does where no browser runs it: nothing here, in a
// browser. `mise run site:native` runs a copy of this bundle in which each
// `X.native.js` stands in the place of `X.js` (host.native.js), so what
// only the desktop does is in no browser's load (tests/payload.spec.js).
var desktop = undefined;
