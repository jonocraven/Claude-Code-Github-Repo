import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";

/**
 * CodeMirror 6 markdown editor — the app's only write surface (brief §6).
 * Autosave is off: the parent owns explicit ⌘S. `onSave` is bound here so
 * ⌘S works whether focus is inside the editor or on the window chrome.
 */
export function MarkdownEditor({
  value,
  onChange,
  onSave,
}: {
  value: string;
  onChange: (next: string) => void;
  onSave: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Keep the latest onSave without rebuilding the editor on every render.
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        highlightActiveLine(),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              saveRef.current();
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
        }),
        EditorView.lineWrapping,
        EditorView.theme({
          "&": { height: "100%", fontSize: "15px", background: "transparent" },
          ".cm-content": { fontFamily: "var(--font-mono)", padding: "12px 0" },
          ".cm-gutters": {
            background: "transparent",
            border: "none",
            color: "var(--ink-faint)",
            fontFamily: "var(--font-mono)",
          },
          "&.cm-focused": { outline: "none" },
          ".cm-activeLine": { background: "color-mix(in srgb, var(--ink) 5%, transparent)" },
          ".cm-activeLineGutter": { background: "transparent" },
          ".cm-cursor": { borderLeftColor: "var(--ink)" },
          ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
            background: "color-mix(in srgb, var(--ink) 15%, transparent)",
          },
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    v.focus();
    return () => v.destroy();
    // Build once per mounted file; value updates from outside are rare and
    // handled by remount (keyed by path in the Reader).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="editor" ref={host} />;
}
