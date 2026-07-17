export function WelcomeWindow() {
  return (
    <article className="welcome">
      <p className="welcome-kicker">Phases 0–5 built — the OS is live</p>
      <h3 className="welcome-heading">Good day, Jono.</h3>
      <p>
        The dock is fully wired. Each <strong>space</strong> opens on a
        dashboard — its memory, its Todoist tasks, recent files and bespoke
        panels. <strong>Tasks</strong>, <strong>Calendar</strong>,{" "}
        <strong>Memory</strong> and <strong>Activity</strong> carry live data;
        the dot up top turns amber or red when a memory file nears its ceiling.
      </p>
      <p>
        <strong>Files</strong> opens everything, the <strong>Reader</strong>
        {" "}linkifies every cross-reference, and <strong>⌘K</strong> searches
        the whole workspace. Add your Todoist token to <code>.env</code> for
        live tasks; Phase 6 brings the hand-drawn icon set and editing.
      </p>
      <dl className="welcome-keys">
        <div>
          <dt>⌘K</dt>
          <dd>search everything</dd>
        </div>
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
