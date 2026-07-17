export function WelcomeWindow() {
  return (
    <article className="welcome">
      <p className="welcome-kicker">Phases 0–3 built — shell, reading, search</p>
      <h3 className="welcome-heading">Good day, Jono.</h3>
      <p>
        <strong>Files</strong> now opens everything: markdown lands in the
        Reader (front-matter card, clickable cross-references, backlinks
        panel), images zoom, PDFs and HTML render in place, CSVs become
        sortable grids.
      </p>
      <p>
        Press <strong>⌘K</strong> for search — documents, apps, and (once the
        index has built) semantic matches under “Related”. The space apps and
        live Todoist data arrive in Phases 4–5.
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
