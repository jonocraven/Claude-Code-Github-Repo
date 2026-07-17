import type { AppDef } from "../apps";
import { AppIcon } from "../icons";

export function PlaceholderWindow({ app }: { app: AppDef }) {
  return (
    <div className="placeholder" style={{ color: `var(${app.accentVar})` }}>
      <span className="placeholder-icon">
        <AppIcon appId={app.id} size={44} />
      </span>
      <p className="placeholder-name">{app.name}</p>
      <p className="placeholder-note">
        {app.arrivesInPhase
          ? `Arrives in Phase ${app.arrivesInPhase}. The window manager, though, already works — drag me about.`
          : "Coming soon."}
      </p>
    </div>
  );
}
