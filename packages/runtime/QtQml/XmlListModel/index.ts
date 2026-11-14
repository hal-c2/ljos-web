// `import QtQml.XmlListModel`: a model whose rows are elements of an XML
// document, fetched from where `source` says.
import { guardedFetch } from "../../guard.js";
import { onCleanup } from "solid-js";
import { contents, defineType, effect, QtObject, settle, slot } from "../../object.ts";
import { AbstractListModel, reset } from "../../QtQuick/model.js";
import { untrack } from "#kernel";
import type { QObject } from "../../object.ts";

const NULL = 0;
const READY = 1;
const LOADING = 2;
const ERROR = 3;

export const XmlListModelRole = defineType("XmlListModelRole", QtObject, {
  properties: { name: "", elementName: "", attributeName: "" },
});

// What a role reads of a row: the text of the element at `names` under it,
// or an attribute of that one or of the row's own element.
interface Role {
  name: string;
  names: string[];
  attribute: string;
}
// What is to be loaded, as `$wanted` works it out.
interface Wanted {
  source: string;
  names: string[];
  roles: Role[];
}
type Row = Record<string, string | null>;

// An XmlListModelRole, and the element name it last refused.
interface RoleObject extends QObject {
  name: string;
  elementName: string;
  attributeName: string;
  $refused?: string;
}

// What a model keeps that no property says.
interface State {
  $error: string;
  $request: AbortController | null;
  $names: string[];
  $refused?: string;
  $elements: unknown[];
}

interface Model extends QObject, State {
  source: string;
  query: string;
  roles: RoleObject[] | null;
  status: number;
  progress: number;
  count: number;
  $wanted(): Wanted;
}

// The elements a query names. Qt reads the document as a stream and never
// goes back a name: once it is in `/rss/channel`, an `item` after the
// channel has ended is one too. Names are compared without their prefix.
function select(root: Element | null, names: string[]): Element[] {
  const found: Element[] = [];
  let level = 0;
  let node: Element | null = root;
  while (node) {
    if (node.localName === names[level]) {
      if (level === names.length - 1) found.push(node);
      else {
        level++;
        if (node.firstElementChild) {
          node = node.firstElementChild;
          continue;
        }
      }
    }
    while (node && !node.nextElementSibling) node = node.parentElement;
    node = node?.nextElementSibling ?? null;
  }
  return found;
}

// Every element at `names` under `element`, in the order of the document.
function each(element: Element, names: string[], level: number, visit: (child: Element) => void): void {
  for (let child = element.firstElementChild; child; child = child.nextElementSibling) {
    if (child.localName !== names[level]) continue;
    if (level < names.length - 1) each(child, names, level + 1, visit);
    else visit(child);
  }
}

// A role's value for a row: the text of an element under the row's or an
// attribute of it, or an attribute of the row's own element. Always text,
// empty when there is no such thing. Of several elements Qt keeps what it
// read last.
function read(element: Element, { names, attribute }: Role): string | null {
  if (!names.length) return (attribute && element.getAttribute(attribute)) || "";
  let value: string | null = "";
  each(element, names, 0, (found) => {
    if (!attribute) value = found.textContent;
    else if (found.hasAttribute(attribute)) value = found.getAttribute(attribute);
    else {
      console.warn(`XmlListModelRole: Query error: "Attribute ${attribute} not found"`);
      value = "";
    }
  });
  return value;
}

// The rows of a document, or the parser's complaint.
function parse(text: string, names: string[], roles: Role[]): { rows?: Row[]; error?: string | undefined } {
  const document = new DOMParser().parseFromString(text, "text/xml");
  const complaint = document.getElementsByTagName("parsererror")[0];
  if (complaint) return { error: complaint.textContent!.trim().split("\n")[0] };
  return {
    rows: select(document.documentElement, names).map((element) => {
      const row: Row = {};
      for (const role of roles) row[role.name] = read(element, role);
      return row;
    }),
  };
}

function status(self: Model, value: number, progress: number): void {
  slot(self, "progress").write(progress);
  slot(self, "status").write(value);
}

function clear(self: Model): void {
  if (self.$elements.length) reset(self, []);
  slot(self, "count").write(0);
}

function load(self: Model, { source, names, roles }: Wanted): void {
  self.$request?.abort();
  self.$request = null;
  self.$error = "";
  if (!source) {
    clear(self);
    return status(self, NULL, 1);
  }
  const request = (self.$request = new AbortController());
  // What it shows stays until what replaces it is here.
  status(self, LOADING, 0);
  const current = () => self.$request === request;
  guardedFetch(source, { signal: request.signal })
    .then((response) => {
      if (!response.ok) throw new Error(`Error transferring ${source} - server replied: ${response.statusText || response.status}`);
      return response.text();
    })
    .then(
      (text) => {
        if (!current()) return;
        self.$request = null;
        const { rows = [], error } = parse(text, names, roles);
        // Qt keeps the rows it read before the document went wrong; a
        // browser's parser gives none of a document it does not take.
        if (error) console.warn(`XmlListModel: Query error: ${JSON.stringify(error)}`);
        reset(
          self,
          rows,
          roles.map((role) => role.name),
        );
        // The rows are counted before the model says it is ready.
        slot(self, "count").write(rows.length);
        settle();
        status(self, READY, 1);
        settle();
      },
      (error: unknown) => {
        if (!current()) return;
        self.$request = null;
        self.$error = String((error as { message?: unknown } | null | undefined)?.message ?? error);
        clear(self);
        status(self, ERROR, 1);
        settle();
      },
    );
}

export const XmlListModel = defineType("XmlListModel", AbstractListModel, {
  properties: { source: "", query: "", roles: [], status: NULL, progress: 0, count: 0 },
  enums: { Null: NULL, Ready: READY, Loading: LOADING, Error: ERROR },
  methods: {
    reload(this: Model): void {
      untrack(() => load(this, this.$wanted()));
      settle();
    },
    errorString(this: Model): string {
      return this.$error;
    },
    // What is to be loaded: the document, the names of the elements that
    // are rows and what each role reads of one.
    $wanted(this: Model): Wanted {
      const query = this.query;
      // A query Qt does not take leaves the one before it.
      if (query[0] === "/") this.$names = query.split("/").filter(Boolean);
      else if (query && query !== this.$refused) console.warn("XmlListModel: An XmlListModel query must start with '/'");
      this.$refused = query;
      const roles: Role[] = [];
      for (const role of this.roles ?? []) {
        const { name, elementName, attributeName } = role;
        const relative = elementName[0] !== "/";
        if (!relative && elementName !== role.$refused) console.warn("XmlListModelRole: An XML element must not start with '/'");
        role.$refused = elementName;
        roles.push({ name, names: relative ? elementName.split("/").filter(Boolean) : [], attribute: attributeName });
      }
      return { source: this.source, names: this.$names, roles };
    },
  },
  setup(made) {
    const self: Model = made as typeof made & State;
    self.$error = "";
    self.$request = null;
    self.$names = [];
    onCleanup(() => self.$request?.abort());
    // Told again of what it has already asked for, it does not ask again.
    let asked: string | undefined;
    effect(
      () => self.$wanted(),
      (wanted) => {
        const key = JSON.stringify(wanted);
        if (key !== asked) load(self, wanted);
        asked = key;
      },
    );
  },
  // Its children are its roles.
  adopt(self, props) {
    slot(self, "roles").provide(contents(props).filter((child) => child?.$type?.chain.includes(XmlListModelRole)));
  },
});
