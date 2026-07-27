export function WelcomeWindow() {
  return (
    <article className="welcome">
      <p className="welcome-kicker">Heaton OS — your workspace, live</p>
      <h3 className="welcome-heading">Good day, Jono.</h3>
      <p>
        Start at <strong>Today</strong>, top of the rail: what's late, what's
        due, what's running, what's moved and what's parked with someone else —
        across every space at once. Below it, each <strong>space</strong> opens
        on its own dashboard (memory, tasks, recent files, bespoke panels), and
        the system tools sit under those.
      </p>
      <p>
        Everything opens as a <strong>tab</strong>, so nothing overlaps. Tabs
        start as <em>previews</em> — browsing spaces costs one tab, not eight.
        Double-click a tab (or start editing) to keep it.
      </p>
      <p>
        Open a document and it reads full-width here. To compare two, use the
        split button (top-right, or <strong>⌘\</strong>) — send a tab to a
        second pane and follow its cross-references side by side.{" "}
        <strong>⌘K</strong> searches the whole workspace; the dot up top turns
        amber or red when a memory file nears its ceiling. Add your Todoist
        token to <code>.env</code> for live tasks.
      </p>
      <dl className="welcome-keys">
        <div>
          <dt>⌘K</dt>
          <dd>search everything</dd>
        </div>
        <div>
          <dt>⌘\</dt>
          <dd>split / unsplit the view</dd>
        </div>
        <div>
          <dt>⌘W</dt>
          <dd>close the active tab</dd>
        </div>
        <div>
          <dt>⌘`</dt>
          <dd>cycle tabs in the pane</dd>
        </div>
      </dl>
    </article>
  );
}
