const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "⌘K", action: "Search documents & apps" },
  { keys: "⌘W", action: "Close the focused window" },
  { keys: "⌘`", action: "Cycle windows" },
  { keys: "⌘S", action: "Save (while editing)" },
  { keys: "⌘/", action: "Show this map" },
  { keys: "Esc", action: "Dismiss search or this map" },
];

export function KeymapOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="keymap-overlay"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="keymap" role="dialog" aria-label="Keyboard shortcuts">
        <h2>Keyboard</h2>
        <div className="keymap-list">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="keymap-row">
              <span>{s.action}</span>
              <kbd className="keymap-keys">{s.keys}</kbd>
            </div>
          ))}
        </div>
        <p className="keymap-hint">Drag a title bar to move · corner to resize</p>
      </div>
    </div>
  );
}
