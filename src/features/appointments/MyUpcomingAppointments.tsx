import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { z } from 'zod';
import { Notice, secondaryClass } from '@/features/directory/Workspace';
import { useOnline } from '@/pwa/useOnline';
import { appointmentRpc } from './requests-api';
import { appointmentSchema } from './requests-model';
import { AppointmentCard } from './AppointmentCard';

export function MyUpcomingAppointments({
  owner,
  collapsed,
}: {
  owner: string;
  collapsed: boolean;
}) {
  const online = useOnline();
  const [open, setOpen] = useState(!collapsed);
  const query = useQuery({
    queryKey: ['appointments', owner, 'upcoming-summary'],
    enabled: online && open,
    retry: false,
    queryFn: async ({ signal }) =>
      z.array(appointmentSchema).parse(
        await appointmentRpc(
          'appointment_agenda',
          {
            p_scope: 'mine',
            p_view: 'upcoming',
            p_establishment: null,
            p_from: null,
            p_to: null,
            p_modality: null,
            p_status: null,
            p_after: null,
            p_after_id: null,
          },
          signal,
        ),
      ),
    refetchInterval: online && open ? 15000 : false,
  });
  return (
    <details
      id="mis-citas"
      className="sv-card space-y-4"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-lg font-semibold">
        <h2 className="inline">Citas pendientes y confirmadas</h2>
      </summary>
      {open && (
        <>
          <p className="text-sm">
            Estas son las próximas citas de tus mascotas. «Solicitada» espera
            respuesta; «Confirmada» ya fue aceptada. Entra en Chat para enviar
            mensajes, fotos o audios a tu veterinaria.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link className={secondaryClass} to="/citas/agenda">
              Ver todas mis citas e historial
            </Link>
            <button
              type="button"
              className={secondaryClass}
              disabled={!online || query.isFetching}
              onClick={() => void query.refetch()}
            >
              Actualizar mis citas
            </button>
          </div>
          {!online ? (
            <Notice>
              Conecta para consultar el estado de tus citas y abrir el chat.
            </Notice>
          ) : query.isError ? (
            <Notice error>
              No pudimos consultar tus citas. Reintenta; esto no significa que
              no tengas citas.
            </Notice>
          ) : query.isPending ? (
            <Notice>Consultando las citas de tus mascotas…</Notice>
          ) : (
            <>
              {query.data?.length === 0 && (
                <p>
                  No tienes citas pendientes ni confirmadas por atender. Puedes
                  solicitar una nueva abajo o consultar tu historial.
                </p>
              )}
              {query.data?.slice(0, 3).map((a) => (
                <AppointmentCard key={a.id} appointment={a} />
              ))}
              {!!query.data && query.data.length > 3 && (
                <p className="text-sm">
                  Mostramos tus tres próximas citas. Abre todas tus citas para
                  consultar las demás.
                </p>
              )}
            </>
          )}
        </>
      )}
    </details>
  );
}
