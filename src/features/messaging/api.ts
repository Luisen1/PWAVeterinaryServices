import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authClient, withAuthOperation } from '@/features/auth/api';
import { appointmentRpc } from '@/features/appointments/requests-api';
import { useOnline } from '@/pwa/useOnline';
import { historySchema, mergeMessages, messageSchema } from './model';

export function useConversation(owner: string, id: string) {
  const online = useOnline();
  const cache = useQueryClient();
  const [connection, setConnection] = useState('Conectando chat…');
  const key = ['chat-history', owner, id];
  const query = useQuery({
    queryKey: key,
    enabled: online,
    retry: false,
    refetchInterval: online ? 5000 : false,
    queryFn: async ({ signal }) => {
      const known =
        cache.getQueryData<ReturnType<typeof historySchema.parse>>(key);
      let cursor = known?.messages.at(-1)?.seq ?? null;
      let result = historySchema.parse(
        await appointmentRpc(
          'chat_history',
          { p_conversation: id, p_after: cursor },
          signal,
        ),
      );
      let incoming = result.messages;
      while (cursor !== null && result.messages.length === 100) {
        cursor = result.messages.at(-1)!.seq;
        result = historySchema.parse(
          await appointmentRpc(
            'chat_history',
            { p_conversation: id, p_after: cursor },
            signal,
          ),
        );
        incoming = mergeMessages(incoming, result.messages);
      }
      const latest =
        cache.getQueryData<ReturnType<typeof historySchema.parse>>(key);
      return {
        ...result,
        messages: mergeMessages(latest?.messages ?? [], incoming),
      };
    },
  });
  useEffect(() => {
    if (!online) return;
    const client = authClient();
    const refresh = () =>
      void cache.invalidateQueries({ queryKey: ['chat-history', owner, id] });
    refresh();
    const channel = client
      .channel(`conversation:${owner}:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${id}`,
        },
        refresh,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_conversations',
          filter: `id=eq.${id}`,
        },
        refresh,
      )
      .subscribe((status) => {
        setConnection(
          status === 'SUBSCRIBED'
            ? 'Chat conectado'
            : 'Recuperando conexión; comprobamos mensajes cada cinco segundos.',
        );
        if (status === 'SUBSCRIBED') refresh();
      });
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      void client.removeChannel(channel);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [owner, id, online, cache]);
  return {
    ...query,
    connection: online
      ? connection
      : 'Sin conexión: mensajes guardados solo en memoria. No puedes enviar ni confirmar lecturas.',
  };
}
export async function sendMessage(
  owner: string,
  id: string,
  conversation: string,
  body: string,
) {
  return withAuthOperation(async () => {
    if (!navigator.onLine)
      throw new Error('Recupera conexión antes de enviar.');
    const { data, error } = await authClient().auth.getUser();
    if (error || data.user?.id !== owner || !data.user.email_confirmed_at)
      throw new Error('Valida tu cuenta para enviar.');
    return messageSchema.parse(
      await appointmentRpc('send_chat_message', {
        p_id: id,
        p_conversation: conversation,
        p_body: body,
      }),
    );
  });
}
