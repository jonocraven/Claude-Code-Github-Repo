export function WelcomeWindow() {
  return (
    <article className="welcome">
      <p className="welcome-kicker">Phase 1 of 6 — the shell</p>
      <h3 className="welcome-heading">Good day, Jono.</h3>
      <p>
        This is the Heaton OS shell: boot screen, menu bar, dock and the
        window manager. Drag this window by its title bar, resize it from any
        edge, minimise it to the dock, and double-click the title bar for a
        comfortable reading size.
      </p>
      <p>
        The <strong>Files</strong> window beside this one is live — it shows
        the real workspace tree served by <code>/api/tree</code>. Everything
        else in the dock opens a placeholder until its phase lands.
      </p>
      <dl className="welcome-keys">
        <div>
          <dt>⌘W</dt>
          <dd>close the focused window</dd>
        </div>
        <div>
          <dt>⌘`</dt>
          <dd>cycle windows</dd>
        </div>
      </dl>
    </article>
  );
}
