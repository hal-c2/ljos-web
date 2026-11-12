import "ljos-web/runtime.css";
import Shell from "./Shell.qml";

// The Pantry, with its shell open to rewrite: the app runs on the
// right through ljos-web's live shell drop (`ljos-web/live`, A9),
// and the editor on the left starts from the app's own Shell.qml
// (embedded by the page from the file beside this one). Applying
// an edit compiles it as a shell over the app's blocks — their
// state is kept — and a shell that does not compile is said no to,
// with the place and the reason, while the running shell stays.
//
// Reusable shape, kept on purpose: mount(el) needs only the shell
// source in the figure's [data-shell-source] script beside it, and
// returns the live handle (`drop`, `reset`, `idle`, `object`).
export default async (el) => {
  const figure = el.closest("figure");
  const appSource = JSON.parse(figure?.querySelector("[data-shell-source]")?.textContent ?? '""');

  const wrap = document.createElement("div");
  wrap.className = "pantry";
  wrap.innerHTML = `
    <div class="pantry-editor">
      <label class="pantry-editor__label" for="pantry-shell-text">Shell.qml — the app's shell, yours to rewrite</label>
      <textarea id="pantry-shell-text" class="pantry-editor__text" spellcheck="false" wrap="off" rows="18"></textarea>
      <div class="pantry-editor__bar">
        <button type="button" class="pantry-apply">Apply shell</button>
        <button type="button" class="pantry-reset">Reset to the app's shell</button>
      </div>
      <p class="pantry-editor__status" role="status"></p>
      <p class="pantry-editor__errors" role="alert" hidden></p>
      <p class="pantry-editor__hint">Try: move the StatusSlot under the Basket, turn the background
      <code>#241a10</code>, or rename the shop. The basket and your note keep what they hold.</p>
    </div>
    <div class="pantry-stage"></div>`;
  el.append(wrap);

  const editor = wrap.querySelector(".pantry-editor__text");
  const status = wrap.querySelector(".pantry-editor__status");
  const errors = wrap.querySelector(".pantry-editor__errors");
  editor.value = appSource;

  const { liveShell } = await import("ljos-web/live");
  const live = liveShell(Shell, wrap.querySelector(".pantry-stage"), { site: "pantry-demo", file: "Shell.qml" });
  // The editor must start from the shell actually shown: a kept
  // shell of this visitor's wins over the app's source.
  await live.idle();
  if (live.text) {
    editor.value = live.text;
    status.textContent = "Your shell from last time is shown.";
  }

  // The drop says what is wrong over the stage; the same words
  // belong beside the editor the visitor is looking at.
  const said = wrap.querySelector(".ljos-live-errors");
  const mirror = () => {
    errors.textContent = said?.textContent ?? "";
    errors.hidden = !errors.textContent;
  };
  if (said) new MutationObserver(mirror).observe(said, { childList: true, characterData: true, attributes: true, subtree: true });

  wrap.querySelector(".pantry-apply").addEventListener("click", async () => {
    status.textContent = "Applying…";
    await live.drop(editor.value);
    mirror();
    status.textContent = errors.hidden
      ? "Your shell is shown. The basket and the note kept what they held."
      : "That shell was not applied — the running shell stays as it was.";
  });
  wrap.querySelector(".pantry-reset").addEventListener("click", async () => {
    editor.value = appSource;
    status.textContent = "Back to the app's shell…";
    // Forgets the kept shell; when one is shown this reloads the
    // page, as nothing less takes everything it handed the blocks.
    await live.reset();
    status.textContent = "The app's shell is shown.";
  });

  return live;
};
