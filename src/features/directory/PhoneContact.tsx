import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { secondaryClass } from './Workspace';

export function PhoneContact({ phone }: { phone: string }) {
  const [message, setMessage] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(phone);
      setMessage('Teléfono copiado.');
    } catch {
      setMessage(`Puedes copiar el teléfono manualmente: ${phone}`);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <a
          className={secondaryClass}
          href={`tel:${phone.replace(/[^+\d]/g, '')}`}
        >
          <Icon name="phone" />
          Llamar a la sede
        </a>
        <button className={secondaryClass} onClick={() => void copy()}>
          Copiar teléfono
        </button>
      </div>
      {message && (
        <p role="status" className="text-xs">
          {message}
        </p>
      )}
    </div>
  );
}
