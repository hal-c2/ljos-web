// What an example downloads itself is asked for at the address main.cpp has.
// A page cannot read most of those (download.qt.io redirects to mirrors that
// send no CORS header), so here that address answers with the gallery's copy.
const served = JSON.parse(new URL(location).searchParams.get("served"));

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const place = served.find(([address]) => event.request.url.startsWith(address));
  if (place) event.respondWith(fetch(place[1] + event.request.url.slice(place[0].length)));
});
