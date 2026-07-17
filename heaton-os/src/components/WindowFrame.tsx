import { Rnd } from "react-rnd";
import { getApp } from "../apps";
import { useWindows, type Win } from "../store/windows";

const MIN_W = 320;
const MIN_H = 220;

export function WindowFrame({ win, children }: { win: Win; children: React.ReactNode }) {
  const focusedId = useWindows((s) => s.focusedId);
  const focus = useWindows((s) => s.focus);
  const close = useWindows((s) => s.close);
  const minimize = useWindows((s) => s.minimize);
  const toggleMaximize = useWindows((s) => s.toggleMaximize);
  const setBounds = useWindows((s) => s.setBounds);

  const app = getApp(win.appId);
  const isFocused = focusedId === win.id;

  if (win.minimized) return null;

  return (
    <Rnd
      bounds="parent"
      position={{ x: win.bounds.x, y: win.bounds.y }}
      size={{ width: win.bounds.w, height: win.bounds.h }}
      minWidth={MIN_W}
      minHeight={MIN_H}
      style={{ zIndex: win.z }}
      dragHandleClassName="window-titlebar"
      cancel=".window-controls"
      onDragStart={() => focus(win.id)}
      onResizeStart={() => focus(win.id)}
      onDragStop={(_e, d) =>
        setBounds(win.id, { ...win.bounds, x: d.x, y: d.y })
      }
      onResizeStop={(_e, _dir, el, _delta, pos) =>
        setBounds(win.id, {
          x: pos.x,
          y: pos.y,
          w: el.offsetWidth,
          h: el.offsetHeight,
        })
      }
      enableResizing={{
        bottom: true,
        bottomLeft: true,
        bottomRight: true,
        left: true,
        right: true,
        top: false,
        topLeft: false,
        topRight: false,
      }}
    >
      <section
        className={`window${isFocused ? " is-focused" : ""}`}
        style={{ "--window-accent": `var(${app.accentVar})` } as React.CSSProperties}
        onPointerDown={() => focus(win.id)}
        aria-label={`${win.title} window`}
      >
        <header
          className="window-titlebar"
          onDoubleClick={() => toggleMaximize(win.id)}
        >
          <span className="window-titlebar-icon" aria-hidden="true" />
          <h2 className="window-title">{win.title}</h2>
          <div className="window-controls">
            <button
              type="button"
              className="window-control"
              onClick={() => minimize(win.id)}
              aria-label={`Minimise ${win.title}`}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M1 7.5h8" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
            <button
              type="button"
              className="window-control"
              onClick={() => toggleMaximize(win.id)}
              aria-label={
                win.premax
                  ? `Restore ${win.title}`
                  : `Maximise ${win.title} to reading size`
              }
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
            <button
              type="button"
              className="window-control window-control-close"
              onClick={() => close(win.id)}
              aria-label={`Close ${win.title}`}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="m1.5 1.5 7 7m0-7-7 7" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
          </div>
        </header>
        <div className="window-body">{children}</div>
      </section>
    </Rnd>
  );
}
