// main.cpp downloads the pictures and meshes the example does not come with
// into its `content` directory, telling App.qml how far it is, and says so
// when all of them are there. Nothing is downloaded ahead here: each is asked
// for where main.cpp gets it, when something shows it.
import { beside } from "ljos-web/object";

beside("file:content/", "https://download.qt.io/learning/examples/FX_Material_Showroom_Assets/");

export const loaded = (window) => window.downloadComplete();
