// Canvas, painted by `onPaint`. Time stands still: the test moves it, a
// frame at a time.
//
// Item {
//     id: root; width: 400; height: 300
//     property color tint: "#898989"
//     property int more: 0
//     property var log: []
//
//     // The arrow of the thermostat example's combo box.
//     Canvas { id: arrow; x: 10; y: 10; width: 12; height: 8; contextType: "2d"
//         onPaint: (region) => {
//             log.push("arrow " + region)
//             context.reset(); context.moveTo(0, 0); context.lineTo(width, 0)
//             context.lineTo(width / 2, height); context.closePath()
//             context.fillStyle = root.tint; context.fill()
//         }
//         onPainted: log.push("arrow painted") }
//     Canvas { id: plain; x: 40; y: 10; width: 60; height: 40
//         onPaint: (region) => {
//             log.push("plain " + region)
//             var ctx = getContext("2d")
//             ctx.fillStyle = "#80ff0000"; ctx.fillRect(0, 0, width, height)
//             ctx.fillStyle = Qt.rgba(0, 0, 1, 1); ctx.fillRect(10, 10, 20, 20)
//             if (root.more > 0) { root.more--; requestPaint() }
//         } }
//     Canvas { id: shapes; x: 120; y: 10; width: 100; height: 60
//         onPaint: {
//             var ctx = getContext("2d")
//             ctx.fillStyle = "#336699"
//             ctx.beginPath().rect(0, 0, 40, 40).rect(10, 10, 20, 20)
//             ctx.fillRule = Qt.OddEvenFill; ctx.fill(); ctx.fillRule = Qt.WindingFill
//             ctx.beginPath(); ctx.moveTo(45, 55); ctx.lineTo(48, 55); ctx.ellipse(50, 0, 40, 20)
//             ctx.fillStyle = "green"; ctx.fill()
//             ctx.beginPath(); ctx.roundedRect(50, 30, 40, 20, 10, 5)
//             ctx.fillStyle = "#80ff0000"; ctx.fill()
//             ctx.strokeStyle = "black"; ctx.lineWidth = 2
//             ctx.beginPath(); ctx.moveTo(0, 50); ctx.lineTo(40, 50); ctx.stroke()
//         } }
//     Canvas { id: gradients; x: 240; y: 10; width: 100; height: 80
//         onPaint: {
//             var ctx = getContext("2d")
//             var across = ctx.createLinearGradient(0, 0, 100, 0)
//             across.addColorStop(0, "red").addColorStop(1, Qt.rgba(0, 0, 1, 1))
//             ctx.fillStyle = across; ctx.fillRect(0, 0, 100, 20)
//             var round = ctx.createConicalGradient(50, 50, 0)
//             round.addColorStop(0, "red"); round.addColorStop(0.25, "#00ff00")
//             round.addColorStop(0.5, "blue"); round.addColorStop(1, "white")
//             ctx.fillStyle = round; ctx.fillRect(20, 20, 60, 60)
//             var out = ctx.createRadialGradient(10, 50, 0, 10, 50, 10)
//             out.addColorStop(0, "black"); out.addColorStop(1, "white")
//             ctx.fillStyle = out; ctx.fillRect(0, 40, 20, 20)
//         } }
//     Canvas { id: hidden; x: 10; y: 100; width: 20; height: 20; visible: false
//         onPaint: (region) => log.push("hidden " + region) }
//     Canvas { id: empty; x: 40; y: 100
//         onPaint: (region) => log.push("empty " + region)
//         onPainted: log.push("empty painted") }
//     Canvas { id: still; x: 70; y: 100; width: 20; height: 20 }
//     Canvas { id: picture; x: 100; y: 100; width: 50; height: 50
//         Component.onCompleted: loadImage("/assets/circle.png")
//         onImageLoaded: { log.push("loaded"); requestPaint() }
//         onPaint: {
//             var ctx = getContext("2d")
//             ctx.fillStyle = "#336699"; ctx.fillRect(0, 0, 50, 50)
//             ctx.drawImage("/assets/circle.png", 0, 0)
//         } }
// }
import { $define, $object, $signal } from "ljos-web/object";
import { Qt } from "ljos-web/QtQml";
import { Canvas, clock, Item } from "ljos-web/QtQuick";
import { make } from "../scene.js";

export const objects = { Qt, clock, log: [] };

const named = (name) => (objects[name] = $object());

export default function Canvases() {
  clock.stop();
  const { log } = objects;
  const [tint, setTint] = $signal("#898989");
  const [more, setMore] = $signal(0);
  const root = named("root");
  const arrow = named("arrow");
  const plain = named("plain");
  const shapes = named("shapes");
  const gradients = named("gradients");
  const picture = named("picture");
  const made = make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(Canvas, {
      $self: arrow,
      x: 10,
      y: 10,
      width: 12,
      height: 8,
      contextType: "2d",
      onPaint: (region) => {
        log.push(`arrow ${region}`);
        arrow.context.reset();
        arrow.context.moveTo(0, 0);
        arrow.context.lineTo(arrow.width, 0);
        arrow.context.lineTo(arrow.width / 2, arrow.height);
        arrow.context.closePath();
        arrow.context.fillStyle = root.tint;
        arrow.context.fill();
      },
      onPainted: () => log.push("arrow painted"),
    }),
    make(Canvas, {
      $self: plain,
      x: 40,
      y: 10,
      width: 60,
      height: 40,
      onPaint: (region) => {
        log.push(`plain ${region}`);
        var ctx = plain.getContext("2d");
        ctx.fillStyle = "#80ff0000";
        ctx.fillRect(0, 0, plain.width, plain.height);
        ctx.fillStyle = Qt.rgba(0, 0, 1, 1);
        ctx.fillRect(10, 10, 20, 20);
        if (root.more > 0) {
          root.more--;
          plain.requestPaint();
        }
      },
    }),
    make(Canvas, {
      $self: shapes,
      x: 120,
      y: 10,
      width: 100,
      height: 60,
      onPaint: () => {
        var ctx = shapes.getContext("2d");
        ctx.fillStyle = "#336699";
        ctx.beginPath().rect(0, 0, 40, 40).rect(10, 10, 20, 20);
        ctx.fillRule = Qt.OddEvenFill;
        ctx.fill();
        ctx.fillRule = Qt.WindingFill;
        ctx.beginPath();
        ctx.moveTo(45, 55);
        ctx.lineTo(48, 55);
        ctx.ellipse(50, 0, 40, 20);
        ctx.fillStyle = "green";
        ctx.fill();
        ctx.beginPath();
        ctx.roundedRect(50, 30, 40, 20, 10, 5);
        ctx.fillStyle = "#80ff0000";
        ctx.fill();
        ctx.strokeStyle = "black";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 50);
        ctx.lineTo(40, 50);
        ctx.stroke();
      },
    }),
    make(Canvas, {
      $self: gradients,
      x: 240,
      y: 10,
      width: 100,
      height: 80,
      onPaint: () => {
        var ctx = gradients.getContext("2d");
        var across = ctx.createLinearGradient(0, 0, 100, 0);
        across.addColorStop(0, "red").addColorStop(1, Qt.rgba(0, 0, 1, 1));
        ctx.fillStyle = across;
        ctx.fillRect(0, 0, 100, 20);
        var round = ctx.createConicalGradient(50, 50, 0);
        round.addColorStop(0, "red");
        round.addColorStop(0.25, "#00ff00");
        round.addColorStop(0.5, "blue");
        round.addColorStop(1, "white");
        ctx.fillStyle = round;
        ctx.fillRect(20, 20, 60, 60);
        var out = ctx.createRadialGradient(10, 50, 0, 10, 50, 10);
        out.addColorStop(0, "black");
        out.addColorStop(1, "white");
        ctx.fillStyle = out;
        ctx.fillRect(0, 40, 20, 20);
      },
    }),
    make(Canvas, {
      $self: named("hidden"),
      x: 10,
      y: 100,
      width: 20,
      height: 20,
      visible: false,
      onPaint: (region) => log.push(`hidden ${region}`),
    }),
    make(Canvas, {
      $self: named("empty"),
      x: 40,
      y: 100,
      onPaint: (region) => log.push(`empty ${region}`),
      onPainted: () => log.push("empty painted"),
    }),
    make(Canvas, { $self: named("still"), x: 70, y: 100, width: 20, height: 20 }),
    make(Canvas, {
      $self: picture,
      x: 100,
      y: 100,
      width: 50,
      height: 50,
      Component$onCompleted: () => picture.loadImage("/assets/circle.png"),
      onImageLoaded: () => {
        log.push("loaded");
        picture.requestPaint();
      },
      onPaint: () => {
        var ctx = picture.getContext("2d");
        ctx.fillStyle = "#336699";
        ctx.fillRect(0, 0, 50, 50);
        ctx.drawImage("/assets/circle.png", 0, 0);
      },
    }),
  ]);
  return $define(made, { tint: [tint, setTint], more: [more, setMore] });
}
