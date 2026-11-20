import { expect, open, test } from "./open.js";

// `property alias content: inner.data`: what an instance declares for it
// joins what the item already has (an item among its children, anything
// else among its resources), and a binding's list replaces it, leaving
// what the list no longer has without a parent, as Qt 6.12 does. So does
// a list a script writes to it.
test("objects given to an alias of an item's list are that item's", async ({ page }) => {
  await open(page, "aliaslist");
  const read = () => page.evaluate(() => window.scene.read());
  // Where `two` is before it is in the list is not this test's: an item a
  // property holds is the declaring item's here, and nobody's in Qt.
  expect(await read()).toMatchObject({ declared: "own,given", resources: "timer", given: "inner", bound: "one", one: "inner", written: "own" });
  await page.evaluate(() => (window.scene.flag = false));
  expect(await read()).toEqual({ declared: "own,given", resources: "timer", given: "inner", bound: "two", one: null, two: "inner", written: "own" });
  await page.evaluate(() => window.scene.write());
  expect((await read()).written, "a script's list is the whole of it").toBe("three");
});

// A list written to the alias is the whole of it in its order, as Qt 6.12
// has it: one with the same objects in another order is that order.
test("a list written to an alias of an item's list is in its order", async ({ page }) => {
  await open(page, "aliaslist");
  expect(await page.evaluate(() => window.scene.reorder())).toEqual(["alpha,beta,gamma", "gamma,alpha,beta"]);
});

// The write ends what was bound to the alias, as an assignment ends any
// property's binding (Qt 6.12), so what the binding then gives is not the
// item's.
test("a list written to an alias of an item's list ends what was bound to it", async ({ page }) => {
  await open(page, "aliaslist");
  await page.evaluate(() => window.scene.writeOverBinding());
  expect(await page.evaluate(() => window.scene.reboundNow())).toEqual({ children: "six", fiveInside: false });
  await page.evaluate(() => (window.scene.flag = false));
  expect(await page.evaluate(() => window.scene.reboundNow())).toEqual({ children: "six", fiveInside: false });
});

// A state's change of the alias is not a script's write: the binding is
// overridden while the state lasts and given back when it ends, following
// what it reads again, as Qt 6.12 has it (measured with qml6).
test("a state that changes an alias of an item's list gives its binding back when it ends", async ({ page }) => {
  await open(page, "aliaslist");
  expect(await page.evaluate(() => window.scene.throughState())).toEqual(["seven", "nine", "nine", "eight", "seven"]);
});

// A state that changes an alias of the alias overrides the inner alias's
// binding in the same way, and gives it back, as Qt 6.12 has it.
test("a state that changes an alias of an alias of an item's list gives the binding back", async ({ page }) => {
  await open(page, "aliaslist");
  expect(await page.evaluate(() => window.scene.throughRelay())).toEqual(["seven", "nine", "nine", "eight", "seven"]);
});

// Qt 6.12: a list with no binding, declared or not, keeps what the state
// gave it once the state ends; only a binding comes back (measured with
// qml6).
test("a list alias with no binding keeps a state's list once the state ends", async ({ page }) => {
  await open(page, "aliaslist");
  expect(await page.evaluate(() => window.scene.unboundThroughState())).toEqual([
    ["own,given", "own"],
    ["ten", "eleven"],
    ["ten", "eleven"],
  ]);
});

// Qt 6.12: so does one whose binding a script's write ended before the
// state began; the binding does not come back either (measured with qml6).
test("a list alias a script wrote keeps a state's list once the state ends", async ({ page }) => {
  await open(page, "aliaslist");
  expect(await page.evaluate(() => window.scene.assignedThroughState())).toEqual(["scripted", "stated", "stated", "stated"]);
});

// An object declared for an alias of an alias is made once: what its own
// bindings read changing changes it, and makes no other.
test("an object declared for an alias of an alias of a list is made once", async ({ page }) => {
  await open(page, "aliaslist");
  expect(await page.evaluate(() => window.scene.declaredRelayOnce())).toEqual(["own,on", "own,off", true]);
});

// Only the alias the state changes is written by the state: a handler
// that write runs, writing another alias, writes it as a script does, as
// Qt 6.12 has it (measured with qml6).
test.describe(() => {
  // A handler of childrenChanged runs inside an effect, so its write's
  // flush is one Solid says does nothing (#132), whoever wrote it.
  test.use({ told: [/FLUSH_IN_EFFECT_CALLBACK/] });
  test("what a state's write of an alias runs writes other aliases as a script", async ({ page }) => {
    await open(page, "aliaslist");
    expect(await page.evaluate(() => window.scene.echoOfState())).toEqual(["seven", "ten"]);
  });
});

// `property alias kept: inner.resources`: what it is given is the item's
// without the item drawing it, so an item keeps the parent it has, and a
// declared one has none, as in Qt 6.12. A binding's list is the whole.
test("objects given to an alias of an item's resources are held, not drawn", async ({ page }) => {
  await open(page, "aliaslist");
  const object = await page.evaluateHandle(async () => {
    const address = performance.getEntriesByType("resource").find(({ name }) => /\/object\.ts(\?|$)/.test(name)).name;
    return await import(address);
  });
  const holders = () => page.evaluate((object) => [object.holdersOf(window.scene.heldOne()), object.holdersOf(window.scene.otherOne())], object);
  const [drawn, other] = await holders();
  const held = () => page.evaluate(() => window.scene.held());
  expect(await held()).toEqual({ kept: "made,kept timer", drawing: "own", made: null, holding: "drawn", drawn: "root", other: "root" });
  await page.evaluate(() => (window.scene.flag = false));
  expect(await held()).toEqual({ kept: "made,kept timer", drawing: "own", made: null, holding: "other", drawn: "root", other: "root" });
  // What the list no longer has is no longer held by the item.
  expect(await holders()).toEqual([drawn - 1, other + 1]);
});

// Taking an item out of the resources it is held in, to give it again in
// another order, leaves it drawn by the item that has it among its
// children, as Qt 6.12 does.
test("items held in resources and given again in another order are still drawn", async ({ page }) => {
  await open(page, "aliaslist");
  expect(await page.evaluate(() => window.scene.reorderHeld())).toEqual([
    ["alpha,beta", "alpha,beta"],
    ["alpha,beta", "beta,alpha"],
  ]);
});

// An object in the item's resources that it does not hold (a Timer given
// to its data) and that starts the list written to them keeps its place
// ahead of what is held after it, as Qt 6.12 has it.
test("a list written to an alias of an item's resources keeps what starts it first", async ({ page }) => {
  await open(page, "aliaslist");
  expect(await page.evaluate(() => window.scene.holdAfterLoose())).toEqual(["tick,alpha", "tick,alpha,beta"]);
});

// An item that holds an object through its resources lets go of it when
// it ends, also when a Loader disposes of it rather than destroying it:
// what outlives the item does not keep it.
test("an item a Loader unloads is no longer held by what it held", async ({ page }) => {
  await open(page, "aliaslist");
  const object = await page.evaluateHandle(async () => {
    const address = performance.getEntriesByType("resource").find(({ name }) => /\/object\.ts(\?|$)/.test(name)).name;
    return await import(address);
  });
  const holders = () => page.evaluate((object) => object.holdersOf(window.scene.sharedOne()), object);
  expect(await holders()).toBe(0);
  await page.evaluate(() => window.scene.holdInLoader());
  expect(await holders(), "held while loaded").toBe(1);
  await page.evaluate(() => window.scene.unload());
  await expect.poll(holders, { message: "let go once unloaded" }).toBe(0);
});

// What the item lets go of when it ends is what it holds then: holding
// and letting go again and again adds nothing to its owner's cleanup.
test("an item that holds its resources again and again lets go of them once", async ({ page }) => {
  await open(page, "aliaslist");
  const cleanups = () =>
    page.evaluate(() => {
      const disposal = window.scene.bothInner().$owner?._disposal;
      return disposal ? [].concat(disposal).length : 0;
    });
  await page.evaluate(() => window.scene.reorderHeld());
  const once = await cleanups();
  await page.evaluate(() => window.scene.reholdHeld(8));
  expect(await cleanups()).toBe(once);
});

// An object declared for an alias of an alias that the property cannot
// hold is told of, as a binding's value it cannot hold is, and the
// property keeps what it held. Qt 6.12 refuses to load the component.
test.describe("an alias of an alias given what it cannot hold", () => {
  test.use({ told: [/^thing: Unable to assign/] });
  test("is told of, and keeps what it held", async ({ page }) => {
    const told = [];
    page.on("console", (message) => message.text().startsWith("thing: Unable to assign") && told.push(message.text()));
    await open(page, "aliasrefused");
    expect(await page.evaluate(() => window.scene.held())).toBe(7);
    expect(told.length).toBe(1);
  });
});
