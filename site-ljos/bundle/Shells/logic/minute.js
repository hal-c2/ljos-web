.pragma library
// The shell's clock: the time to the minute, in the reader's own zone,
// and how long until the minute turns, so its timer wakes once a minute
// at the turn. It reads Date's local-time getters, which Ljós's API has
// no type for yet (no `Clock` in the web's Ljos.Core).
function now() {
    var at = new Date();
    return {
        clock: String(at.getHours()).padStart(2, "0") + ":" + String(at.getMinutes()).padStart(2, "0"),
        wait: 60000 - at.getSeconds() * 1000 - at.getMilliseconds() + 20,
    };
}
