// A DragHandler on the move that makes it active, and on those after it:
// the moves of `scenes/dragactivate.qml`, one mouse event each, and what Qt
// 6.12 said of the same scene under qmltestrunner (mousePress, mouseMove,
// mouseRelease on a fresh scene for each case; its threshold there was 8,
// here 10, so no move falls between them).
//
// The move that makes the drag active moves the target the whole way from
// the press but publishes no translation: `translation`, `activeTranslation`
// and `persistentTranslation` stay as they were and `translationChanged` is
// not told. The next move publishes the whole offset from the press, even
// from where the activating move left the point. A drag of one move, so,
// moves its target and ends with nothing translated.
import { expect, open, test } from "./open.js";

const CASES = {
  threshold_then_more: [
    ["press", 10, 210, ["centroid 10,10 sp=10,210"]],
    ["move", 15, 210, ["centroid 15,10 sp=15,210"]],
    ["move", 25, 215, ["centroid 25,15 sp=25,215", "active true t=0,0 at=0,0 pt=0,0 c=25,15 sp=25,215", "item x=15", "item y=205"]],
    ["move", 45, 230, ["centroid 30,25 sp=45,230", "xAxis 35 d=35", "yAxis 20 d=20", "ptC 35,20", "atC 35,20", "tr d=35,20 t=35,20 at=35,20 pt=35,20 item=15,205", "item x=35", "item y=220"]],
    ["release", 45, 230, ["active false t=0,0 at=0,0 pt=35,20 c=10,10 sp=45,230", "centroid 0,0 sp=0,0"]],
  ],
  one_big_move: [
    ["press", 10, 210, ["centroid 10,10 sp=10,210"]],
    ["move", 110, 210, ["centroid 110,10 sp=110,210", "active true t=0,0 at=0,0 pt=0,0 c=110,10 sp=110,210", "item x=100"]],
    ["release", 110, 210, ["active false t=0,0 at=0,0 pt=0,0 c=10,10 sp=110,210", "centroid 0,0 sp=0,0"]],
  ],
  small_moves: [
    ["press", 10, 210, ["centroid 10,10 sp=10,210"]],
    ["move", 14, 210, ["centroid 14,10 sp=14,210"]],
    ["move", 18, 210, ["centroid 18,10 sp=18,210"]],
    ["move", 22, 210, ["centroid 22,10 sp=22,210", "active true t=0,0 at=0,0 pt=0,0 c=22,10 sp=22,210", "item x=12"]],
    ["move", 26, 210, ["centroid 14,10 sp=26,210", "xAxis 16 d=16", "yAxis 0 d=0", "ptC 16,0", "atC 16,0", "tr d=16,0 t=16,0 at=16,0 pt=16,0 item=12,200", "item x=16"]],
    ["move", 30, 210, ["centroid 14,10 sp=30,210", "xAxis 20 d=4", "yAxis 0 d=0", "ptC 20,0", "atC 20,0", "tr d=4,0 t=20,0 at=20,0 pt=20,0 item=16,200", "item x=20"]],
    ["release", 30, 210, ["active false t=0,0 at=0,0 pt=20,0 c=10,10 sp=30,210", "centroid 0,0 sp=0,0"]],
  ],
  no_target: [
    ["press", 210, 210, []],
    ["move", 230, 210, ["nt active true t=0,0 at=0,0 pt=0,0"]],
    ["move", 260, 210, ["nt xAxis 50 d=50", "nt tr d=50,0 t=50,0 at=50,0 pt=50,0"]],
    ["release", 260, 210, ["nt active false t=0,0 at=0,0 pt=50,0"]],
  ],
  axis_limits: [
    ["press", 110, 210, []],
    ["move", 130, 230, ["lim active true t=0,0 at=0,0 pt=0,0", "lim item x=120"]],
    ["move", 300, 260, ["lim xAxis 190 d=190", "lim tr d=190,0 t=190,0 at=190,0 pt=150,0 item=120", "lim item x=150"]],
    ["release", 300, 260, ["lim active false t=0,0 at=0,0 pt=150,0"]],
  ],
  bounded: [
    ["press", 310, 210, []],
    ["move", 330, 210, ["bd active true t=0,0 at=0,0 pt=0,0 xv=0"]],
    ["move", 410, 210, ["bd xAxis 100 d=100", "bd tr d=100,0 t=100,0 at=100,0 pt=30,0 xv=100", "bd ptC 30"]],
    ["move", 250, 210, ["bd xAxis -60 d=-160", "bd tr d=-160,0 t=-60,0 at=-60,0 pt=-30,0 xv=-60", "bd ptC -30"]],
    ["release", 250, 210, ["bd active false t=0,0 at=0,0 pt=-30,0 xv=0"]],
  ],
  bounded_big_move: [
    ["press", 310, 210, []],
    ["move", 410, 210, ["bd active true t=0,0 at=0,0 pt=0,0 xv=0"]],
    ["release", 410, 210, ["bd active false t=0,0 at=0,0 pt=0,0 xv=0"]],
  ],
  release_elsewhere: [
    ["press", 10, 210, ["centroid 10,10 sp=10,210"]],
    ["move", 110, 210, ["centroid 110,10 sp=110,210", "active true t=0,0 at=0,0 pt=0,0 c=110,10 sp=110,210", "item x=100"]],
    ["release", 160, 220, ["active false t=0,0 at=0,0 pt=0,0 c=10,10 sp=110,210", "centroid 0,0 sp=0,0"]],
  ],
  same_place_again: [
    ["press", 10, 210, ["centroid 10,10 sp=10,210"]],
    ["move", 110, 210, ["centroid 110,10 sp=110,210", "active true t=0,0 at=0,0 pt=0,0 c=110,10 sp=110,210", "item x=100"]],
    ["move", 110, 210, ["centroid 10,10 sp=110,210", "xAxis 100 d=100", "yAxis 0 d=0", "ptC 100,0", "atC 100,0", "tr d=100,0 t=100,0 at=100,0 pt=100,0 item=100,200"]],
    ["release", 110, 210, ["active false t=0,0 at=0,0 pt=100,0 c=10,10 sp=110,210", "centroid 0,0 sp=0,0"]],
  ],
  bounded_past_limit: [
    ["press", 310, 210, []],
    ["move", 330, 210, ["bd active true t=0,0 at=0,0 pt=0,0 xv=0"]],
    ["move", 410, 210, ["bd xAxis 100 d=100", "bd tr d=100,0 t=100,0 at=100,0 pt=30,0 xv=100", "bd ptC 30"]],
    ["move", 420, 210, ["bd xAxis 110 d=10", "bd tr d=10,0 t=110,0 at=110,0 pt=30,0 xv=110", "bd ptC 30"]],
    ["release", 420, 210, ["bd active false t=0,0 at=0,0 pt=30,0 xv=0"]],
  ],
  y_only: [
    ["press", 10, 210, ["centroid 10,10 sp=10,210"]],
    ["move", 12, 260, ["centroid 12,60 sp=12,260", "active true t=0,0 at=0,0 pt=0,0 c=12,60 sp=12,260", "item x=2", "item y=250"]],
    ["move", 14, 270, ["centroid 12,20 sp=14,270", "xAxis 4 d=4", "yAxis 60 d=60", "ptC 4,60", "atC 4,60", "tr d=4,60 t=4,60 at=4,60 pt=4,60 item=2,250", "item x=4", "item y=260"]],
    ["release", 14, 270, ["active false t=0,0 at=0,0 pt=4,60 c=10,10 sp=14,270", "centroid 0,0 sp=0,0"]],
  ],
};

// What Ljós says where Qt said `lines`, in two ways it differs on purpose:
// - a property tells of its change before the signal that goes with it
//   (handlers.spec.js), so the translations' changes come before the axes'
//   `activeValueChanged` and `translationChanged`, in Qt's order;
// - the release puts `activeTranslation` back to nothing and says so,
//   where Qt 6.12 says nothing and leaves a binding to it showing the
//   drag's last value.
function told(kind, lines, moved) {
  const changes = lines.filter((line) => /^(\w+ )?(ptC|atC) /.test(line));
  const rest = lines.filter((line) => !changes.includes(line));
  const first = rest.findIndex((line) => /^(\w+ )?(xAxis|yAxis|tr) /.test(line));
  const said = first < 0 ? [...rest, ...changes] : [...rest.slice(0, first), ...changes, ...rest.slice(first)];
  if (kind !== "release" || !moved) return said;
  const end = said.findIndex((line) => line.startsWith("active false"));
  return [...said.slice(0, end + 1), "atC 0,0", ...said.slice(end + 1)];
}

for (const [name, steps] of Object.entries(CASES)) {
  test(`a drag, ${name.replaceAll("_", " ")}, says what Qt says`, async ({ page }) => {
    await open(page, "dragactivate");
    // Whether the handler that tells of `activeTranslation` has one.
    let moved = false;
    for (const [kind, x, y, lines] of steps) {
      const expected = told(kind, lines, moved);
      for (const line of lines) if (line.startsWith("atC ")) moved = line !== "atC 0,0";
      if (kind === "press") {
        await page.mouse.move(x, y);
        await page.mouse.down();
      } else if (kind === "move") await page.mouse.move(x, y);
      else {
        // Let go where no move went first, as mouseRelease does.
        const device = await page.context().newCDPSession(page);
        await device.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
      }
      expect(await page.evaluate(() => window.objects.log.splice(0)), `${kind} ${x},${y}`).toEqual(expected);
    }
  });
}
