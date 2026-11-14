// `Component`: at run time a component is the function the compiler made of
// it (`$component`), so what is left for the name is its enums, for the
// `status` of the things that load one.
export const Component = Object.freeze({
  Null: 0,
  Ready: 1,
  Loading: 2,
  Error: 3,
  PreferSynchronous: 0,
  Asynchronous: 1,
});
