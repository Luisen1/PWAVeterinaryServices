import { Link } from 'react-router';
import { secondaryClass } from '@/features/directory/Workspace';
import { AppointmentChatButton } from '@/features/messaging/AppointmentChatButton';
import { slotLabel } from './model';
import { appointmentStatus, type Appointment } from './requests-model';

export function AppointmentCard({
  appointment: a,
  team = false,
}: {
  appointment: Appointment;
  team?: boolean;
}) {
  return (
    <article
      className="sv-card space-y-2"
      aria-label={`Cita de ${a.snapshot.pet_name}`}
    >
      <p className="font-semibold">
        {a.snapshot.pet_name} · {a.snapshot.service_name}
      </p>
      <p>
        <span className="status-badge">{appointmentStatus[a.status]}</span> ·{' '}
        {a.modality}
      </p>
      {a.status === 'requested' && (
        <p className="text-sm">
          Pendiente de confirmación del establecimiento.
        </p>
      )}
      <p className="text-sm">
        {a.snapshot.establishment_name} · {a.snapshot.site_name}
      </p>
      <p className="text-sm">
        {slotLabel({ ...a, timezone: a.snapshot.timezone })}
      </p>
      {!!a.events.at(-1)?.reason && (
        <p className="text-sm">{a.events.at(-1)!.reason}</p>
      )}
      <div className="flex flex-wrap items-start gap-3">
        <Link
          className={secondaryClass}
          to={`/citas/solicitudes/${a.id}${team ? '?equipo=1' : ''}`}
        >
          Ver detalle de {a.snapshot.pet_name}
        </Link>
        <AppointmentChatButton appointment={a} />
      </div>
    </article>
  );
}
