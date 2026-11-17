import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/features/auth/useAuth';
import { authClient, withAuthOperation } from '@/features/auth/api';
import { appointmentRpc } from '@/features/appointments/requests-api';
import type { Appointment } from '@/features/appointments/requests-model';
import { Notice } from '@/features/directory/Workspace';
import { useOnline } from '@/pwa/useOnline';
import { conversationSchema } from './model';

export function AppointmentChatButton({
  appointment,
}: {
  appointment: Appointment;
}) {
  const auth = useAuth();
  const owner = auth.user?.id;
  const online = useOnline();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const open = useMutation({
    mutationFn: () =>
      withAuthOperation(async () => {
        if (!online) throw new Error('Recupera conexión para abrir el chat.');
        const { data, error } = await authClient().auth.getUser();
        if (error || data.user?.id !== owner || !data.user?.email_confirmed_at)
          throw new Error('Valida tu cuenta para abrir el chat.');
        return conversationSchema.parse(
          await appointmentRpc('open_appointment_chat', {
            p_appointment: appointment.id,
          }),
        );
      }),
    onSuccess: (conversation) => {
      void cache.invalidateQueries({ queryKey: ['chat-inbox', owner] });
      void navigate(`/mensajes/${conversation.id}`);
    },
  });
  if (!appointment.can_chat) return null;
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="button button-primary"
        disabled={!online || !owner || open.isPending}
        aria-label={`Chat de la cita de ${appointment.snapshot.pet_name}`}
        onClick={() => open.mutate()}
      >
        <Icon name="chat" />
        {open.isPending ? 'Abriendo chat…' : 'Chat'}
      </button>
      {!online && (
        <p className="text-xs">Conecta para abrir la conversación.</p>
      )}
      {open.isError && (
        <Notice error>
          No pudimos abrir el chat. Comprueba tu conexión y tus permisos de
          citas y mensajes; reintenta para recuperar la misma conversación.
        </Notice>
      )}
    </div>
  );
}
