import { expect, it } from 'vitest';
import { installGuidance } from './install-guidance';
it('distingue iOS incluso en iPad con agente de escritorio, Android y Mac Safari', () => {
  expect(installGuidance('Safari', 'MacIntel', 5).title).toContain('iPhone');
  expect(
    installGuidance('iPhone CriOS Safari', 'iPhone', 5).steps[0],
  ).toContain('Safari');
  expect(installGuidance('Android Chrome Safari', 'Linux', 5).title).toContain(
    'Android',
  );
  expect(
    installGuidance('Version/26 Safari', 'MacIntel', 0).steps[1],
  ).toContain('Dock');
});
it('da alternativas de escritorio sin presentar una instalación garantizada', () => {
  expect(installGuidance('Firefox', 'Win32', 0).steps[0]).toContain(
    'Chrome o Edge',
  );
  expect(installGuidance('Chrome Safari', 'Win32', 0).steps[0]).toContain(
    'barra de direcciones',
  );
});
