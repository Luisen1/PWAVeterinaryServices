import { expect, it } from 'vitest';
import {
  isRead,
  mergeMessages,
  type Conversation,
  type Message,
} from './model';
const message = (seq: string, id = seq) =>
  ({ seq, id, author_side: 'customer' }) as Message;
it('recupera mensajes sin duplicados y ordena cursores mayores que la precisión de Number', () => {
  const first = message('9007199254740993');
  const second = message('9007199254740994');
  expect(mergeMessages([second], [first, second])).toEqual([first, second]);
});
it('enviado solo pasa a leído cuando la otra parte confirma ese cursor', () => {
  const c = { team_read_seq: '8', customer_read_seq: '20' } as Conversation;
  expect(isRead(message('9'), c)).toBe(false);
  expect(isRead(message('8'), c)).toBe(true);
  expect(isRead({ ...message('20'), author_side: 'team' }, c)).toBe(true);
});
