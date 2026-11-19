import { expect, it } from 'vitest';
import {
  sealRecovery,
  openRecovery,
} from '../../supabase/functions/_shared/recovery-crypto';
it('cifra sin texto privado visible y recupera el contenido con la clave correcta', async () => {
  const source = {
      private: 'Contenido de paciente que no se imprime',
      bytes: [1, 2, 3],
    },
    key = 'ab'.repeat(32);
  const value = await sealRecovery(source, key);
  expect(JSON.stringify(value)).not.toContain(source.private);
  expect(await openRecovery(value, key)).toEqual(source);
});
it('rechaza clave incorrecta, contenido alterado y metadatos alterados', async () => {
  const value = await sealRecovery({ value: 1 }, 'ab'.repeat(32));
  await expect(openRecovery(value, 'cd'.repeat(32))).rejects.toThrow(
    'no pudo verificarse',
  );
  await expect(
    openRecovery({ ...value, created_at: '2000-01-01' }, 'ab'.repeat(32)),
  ).rejects.toThrow('no pudo verificarse');
  await expect(
    openRecovery(
      { ...value, ciphertext: value.ciphertext.slice(0, -5) + 'AAAAA' },
      'ab'.repeat(32),
    ),
  ).rejects.toThrow('no pudo verificarse');
});
it('no admite claves incompletas ni formatos desconocidos', async () => {
  await expect(sealRecovery({}, 'masked')).rejects.toThrow('32 bytes');
  const value = await sealRecovery({}, 'ab'.repeat(32));
  await expect(
    openRecovery(
      { ...value, version: 2 } as unknown as typeof value,
      'ab'.repeat(32),
    ),
  ).rejects.toThrow('no compatible');
});
