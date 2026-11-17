// What the SITE-4 audit found broken, with why, for `test.fail`: the
// test runs and must fail. A fixed example makes its test red, so it
// comes out of here in the change that fixes it, and the suite then
// holds it working.

// An example the audit found broken, by page and its place on it (the
// docs are pinned, site/ljos-ui.sha): the reason, as the audit says it.
// None now: the two Controls fields /quality/accessibility/ shows
// take a press since Ljos.Controls reached the web.
const BROKEN = {};

export function brokenExample(route, index) {
  return BROKEN[`${route}#${index}`] ?? null;
}

export const sourceView = "SOURCE lane: a demo has no 'show source' yet";

export const demo = {
  fieldGuideSearch:
    "audit: a mouse press on the field guide's search field leaves focus on the page body, so what the reader types goes nowhere; typing after focus() does filter the list",
};
