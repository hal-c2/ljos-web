// What a TypeScript program may write against QtQml's types. Never run:
// `tsc` checks it with the rest (`pnpm typecheck`), and each
// `@ts-expect-error` fails the check once what it marks typechecks.
import { Qt } from "../QtQml/Qt.ts";
import { XMLHttpRequest } from "../QtQml/request.ts";
import { Matrix4x4, Vector3d, Vector4d } from "../QtQml/values.ts";

export function written(): void {
  // A function later, with the arguments it takes.
  Qt.callLater((value: number) => value + 1, 1);
  // @ts-expect-error a string is not the number it takes
  Qt.callLater((value: number) => value + 1, "1");

  // A matrix times a number or a matrix is a matrix, times a vector a vector.
  const matrix: Matrix4x4 = new Matrix4x4().times(2).inverted();
  const turned: Matrix4x4 = matrix.times(matrix);
  const point: Vector3d = turned.times(new Vector3d(1, 2, 3));
  const column: Vector4d = turned.times(new Vector4d(1, 2, 3, 1));
  void [point, column];

  // An enum's member, on its own and by its enum's name, is the number it is.
  const iso: number = Qt.ISODate;
  const left: number = Qt.Alignment.AlignLeft;
  Qt.formatDate(new Date(), Qt.ISODate);
  void [iso, left];

  // Every state of a request.
  const states: readonly number[] = [
    XMLHttpRequest.UNSENT,
    XMLHttpRequest.OPENED,
    XMLHttpRequest.HEADERS_RECEIVED,
    XMLHttpRequest.LOADING,
    XMLHttpRequest.DONE,
  ];
  void states;
}
