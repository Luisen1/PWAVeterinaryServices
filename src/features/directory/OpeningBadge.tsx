import type { Site } from './model';
import { openingAt } from './opening';

export function OpeningBadge({
  site,
  now,
  trusted,
}: {
  site: Site;
  now: Date;
  trusted: boolean;
}) {
  const opening = openingAt(site, now, trusted);
  return (
    <div className="opening-state" data-state={opening.state}>
      <span className="status-badge">{opening.label}</span>
      {opening.allDay && (
        <span className="status-badge">Horario semanal 24 horas</span>
      )}
      <p className="text-xs text-stone-600">{opening.reason}</p>
    </div>
  );
}
