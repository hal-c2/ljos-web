// What a TypeScript program may write against a type it defines. Never run:
// `tsc` checks it with the rest (`pnpm typecheck`), and each
// `@ts-expect-error` fails the check once what it marks typechecks.
import { defineType } from "../object.ts";

export function written(): void {
  // An accessor named in `changes` has a change signal, as a property has.
  const Tally = defineType("Tally", null, {
    properties: { count: 0 },
    methods: {
      get values(): readonly number[] {
        return [];
      },
    },
    changes: ["values"],
  });
  const tally = Tally();
  tally.valuesChanged.connect(() => {});
  tally.countChanged.connect(() => {});
  // @ts-expect-error only what `changes` names has one
  tally.othersChanged.connect(() => {});
}
