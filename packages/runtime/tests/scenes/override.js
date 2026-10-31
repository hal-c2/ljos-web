// `overridden.qml` with the runtime's way to put something over a property
// (`override`), for a test to call.
import { override } from "ljos-web/object";
import Overridden from "./overridden.qml";

window.override = override;

export default Overridden;
