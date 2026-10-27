// The same module for a file that is of another style.
import { $object } from "ljos-web/object";
import { Shelf } from "ljos-web/QtShelf";
import { make } from "../scene.js";

const shelf = $object();

export const objects = { shelf };

export default () => make(Shelf, { $self: shelf });
