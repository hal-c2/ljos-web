// `objecttyped.qml` with the runtime's way to put something over a property
// (`override`), for a test to call.
import { override } from "ljos-web/object";
import Objecttyped from "./objecttyped.qml";

window.override = override;

export default Objecttyped;
