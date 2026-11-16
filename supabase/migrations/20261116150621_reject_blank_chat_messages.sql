-- Incluso los clientes que omitan trim deben enviar texto con contenido.
alter table public.chat_messages add constraint chat_messages_nonblank check(body ~ '[^[:space:]]');
