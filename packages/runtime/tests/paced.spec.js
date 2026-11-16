// How a 3D view's pictures are paced (QtQuick3D/paced.js): after slow
// pictures the page is left to itself, and the time a fence is asked late
// is not the GPU's.
import { expect, test } from "@playwright/test";
import { done, paced } from "../QtQuick3D/paced.js";

test("one slow picture gives no rest; the next is drawn at once", () => {
  const pace = paced();
  pace.drew(0, 300);
  expect(pace.wait(300)).toBe(0);
});

test("two slow pictures in a row rest as long as the last took", () => {
  const pace = paced();
  pace.drew(0, 80);
  pace.drew(100, 190);
  expect(pace.wait(190)).toBe(90);
  expect(pace.wait(250)).toBe(30);
  expect(pace.wait(280)).toBe(0);
});

test("a rest is a second at most", () => {
  const pace = paced();
  pace.drew(0, 3_000);
  pace.drew(3_000, 6_000);
  expect(pace.wait(6_000)).toBe(1_000);
});

test("a quick picture after slow ones ends the rest", () => {
  const pace = paced();
  pace.drew(0, 80);
  pace.drew(100, 190);
  pace.drew(300, 310);
  expect(pace.wait(310)).toBe(0);
});

test("a timer that rings a millisecond early does not wait again", () => {
  const pace = paced();
  pace.drew(0, 80);
  pace.drew(100, 190);
  expect(pace.wait(279.5)).toBe(0);
});

test("a fence asked on time is done when it is seen done", () => {
  expect(done(100, 104)).toBe(104);
});

test("a fence asked late, the page held by something else, is done soon after it was last seen at work", () => {
  // Seen at work at 100, then a 60 ms task: what the GPU took ends by 108.
  expect(done(100, 164)).toBe(108);
});
