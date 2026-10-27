// The selectors' scene. A selector looks at which files there are, which a
// page is told by its build: here by the scene, of the folder its pictures
// are in.
import { resources } from "ljos-web/object";
import Scene from "./selectors.qml";

const files = import.meta.glob("../assets/chosen/*", { eager: true, query: "?url", import: "default" });
for (const file of Object.values(files)) {
  const url = new URL(file, location.href).href;
  resources.set(url, url);
}

export default Scene;
