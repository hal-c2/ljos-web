// `fetch` as a file of a program calls it: the browser's, through the
// guard, with what a relative address names found beside the file where
// the page knows the file's address (a live example's, `ljos-web/compiler`),
// as QML's XMLHttpRequest finds it. A live example's files are on no
// server, so the browser's own would ask the page's site for them.
import { guardedFetch } from "../guard.js";
import { located } from "../object.ts";

type Fetch = ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) & {
  beside(address: string | URL): Fetch;
};

const whole = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;
const isRequest = (input: unknown): input is Request => typeof Request !== "undefined" && input instanceof Request;

function made(address?: string | URL): Fetch {
  const call = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // A Request was made whole where it was made, against the page.
    if (isRequest(input)) return guardedFetch(input, init);
    const named = String(input);
    return guardedFetch(located(address === undefined || whole.test(named) ? named : new URL(named, address).href), init);
  };
  return Object.assign(call, { beside: (at: string | URL) => made(at) });
}

export const fetch: Fetch = made();
