// Tasks, as `qmlc` emits them for `import Ljos.Core` (ljos-ui's
// `features/components/task.feature`). Each run here is a promise the test
// settles, so what a run gives, and when, is the test's to say.
//
// import Ljos.Core
// Item {
//     id: root
//     property string city: "Oslo"
//     Task {
//         id: weather; args: [root.city]
//         run: (city, signal) => new Promise(…)
//         onDone: (value) => log.push(`done ${value}`)
//         onFailed: (error) => log.push(`failed ${error.name}: ${error.message}`)
//         onStatusChanged: log.push(`status ${status}`)
//     }
//     Task { id: manual; autoRun: false; args: ["given"]; run: (what) => what }
//     Task { id: throws; run: () => { throw new Error("thrown") } }
//     Task {
//         id: moving; args: [root.place]
//         run: (place, signal) => { … root.place = "Bergen" while running "Oslo" }
//     }
//     Loader { id: loader; component: Item { Task { id: loaded; run: … } } }
// }
import { $component, $define, $object, $signal } from "ljos-web/object";
import { Task } from "ljos-web/Ljos/Core";
import { Item, Loader } from "ljos-web/Ljos/Ui";
import { make } from "../scene.js";

const names = ["root", "weather", "manual", "throws", "moving", "loader", "loaded"];
export const objects = { log: [], runs: [], ran: "", aborts: 0, loadedSignal: null };

// A run that is settled by the test: `objects.runs` holds what it was given
// and how to settle it.
const settled = (name) => (...args) => {
  const signal = args.pop();
  return new Promise((resolve, reject) => objects.runs.push({ name, args, signal, resolve, reject }));
};

export default function Tasks() {
  for (const name of names) objects[name] = $object();
  const { log, root, weather } = objects;
  const [city, setCity] = $signal("Oslo");
  const [place, setPlace] = $signal("Oslo");
  const told = (name) => ({
    onDone: (value) => log.push(`${name} done ${value}`),
    onFailed: (error) => log.push(`${name} failed ${error.name}: ${error.message}`),
  });
  const loads = $component(() =>
    make(Item, {}, () =>
      make(Task, {
        $self: objects.loaded,
        run: (signal) => {
          objects.loadedSignal = signal;
          return new Promise(() => {});
        },
      }),
    ),
  );
  const made = make(Item, { $self: root, width: 200, height: 100 }, () => [
    make(Task, {
      $self: weather,
      get args() {
        return [city()];
      },
      run: settled("weather"),
      ...told("weather"),
      onStatusChanged: () => log.push(`status ${weather.status}`),
      onValueChanged: () => log.push(`value ${weather.value}`),
    }),
    make(Task, { $self: objects.manual, autoRun: false, args: ["given"], run: (what) => what, ...told("manual") }),
    make(Task, {
      $self: objects.throws,
      run: () => {
        throw new Error("thrown");
      },
      ...told("throws"),
    }),
    make(Task, {
      $self: objects.moving,
      get args() {
        return [place()];
      },
      run: (where, signal) => {
        objects.ran += `${where};`;
        signal.addEventListener("abort", () => (objects.aborts += 1));
        if (where === "Oslo") setPlace("Bergen");
        return where;
      },
    }),
    make(Loader, { $self: objects.loader, component: loads }),
  ]);
  return $define(made, { city: [city, setCity], place: [place, setPlace] });
}
