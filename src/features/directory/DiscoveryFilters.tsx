import { useEffect, useRef, useState } from 'react';
import { categories, species } from './model';
import { modalities } from '@/features/offerings/model';
import type { Item } from '@/features/offerings/model';

import { advancedKeys } from './discovery';
export function DiscoveryFilters({
  params,
  services,
  change,
}: {
  params: URLSearchParams;
  services: Item<'service'>[];
  change: (values: Record<string, string>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(() => new URLSearchParams(params));
  const update = (values: Record<string, string>) =>
    setDraft((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(values)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    });
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (expanded) dialog.current?.showModal();
    else dialog.current?.close();
  }, [expanded]);
  const count =
    advancedKeys.filter((key) => !!params.get(key)).length +
    Number(!!params.get('categoria'));
  const names = [...new Set(services.map((s) => s.document.name))].sort(
    (a, b) => a.localeCompare(b, 'es'),
  );
  const clear = () =>
    update(
      Object.fromEntries(
        [...advancedKeys, 'categoria'].map((key) => [key, '']),
      ),
    );
  return (
    <section className="discovery-filters" aria-label="Filtros combinados">
      <button
        className="category-chip"
        aria-haspopup="dialog"
        aria-expanded={expanded}
        onClick={() => {
          setDraft(new URLSearchParams(params));
          setExpanded(true);
        }}
      >
        Más filtros{count ? ` (${count})` : ''}
      </button>
      <dialog
        ref={dialog}
        className="discovery-filters-dialog space-y-4"
        aria-label="Filtrar servicios y atención"
        onCancel={() => setExpanded(false)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Filtrar servicios y atención</h2>
          <button
            className="button button-secondary ml-auto"
            onClick={() => {
              change(
                Object.fromEntries(
                  [...advancedKeys, 'categoria'].map((key) => [
                    key,
                    draft.get(key) ?? '',
                  ]),
                ),
              );
              setExpanded(false);
            }}
          >
            Ver resultados
          </button>
          {[...advancedKeys, 'categoria'].some((key) => !!draft.get(key)) && (
            <button className="category-chip" onClick={clear}>
              Limpiar filtros
            </button>
          )}
          {advancedKeys
            .filter((key) => !!draft.get(key))
            .map((key) => (
              <button
                key={key}
                className="category-chip"
                aria-label={`Quitar filtro ${key}`}
                onClick={() => update({ [key]: '' })}
              >
                {
                  {
                    servicio: 'Servicio',
                    especie: 'Especie',
                    modalidad: 'Modalidad',
                    urgencias: 'Urgencias',
                    domicilio: 'Domicilio',
                    abierto: 'Abierto ahora',
                    '24h': '24 horas',
                  }[key]
                }
                {['servicio', 'especie', 'modalidad'].includes(key)
                  ? `: ${draft.get(key)}`
                  : ''}{' '}
                ×
              </button>
            ))}
        </div>
        <div className="space-y-4">
          {[
            { key: 'servicio', label: 'Servicio ofrecido', values: names },
            { key: 'categoria', label: 'Categoría', values: [...categories] },
            { key: 'especie', label: 'Especie atendida', values: [...species] },
            {
              key: 'modalidad',
              label: 'Modalidad de atención',
              values: [...modalities],
            },
          ].map(({ key, label, values }) => (
            <label key={key} className="block text-sm">
              {label}
              <select
                className="sv-input"
                aria-label={label}
                value={draft.get(key) ?? ''}
                onChange={(e) => update({ [key]: e.target.value })}
              >
                <option value="">Todas las opciones</option>
                {values.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          ))}
          {[
            ['urgencias', 'Atiende urgencias declaradas'],
            ['domicilio', 'Atención a domicilio'],
            ['abierto', 'Abierto ahora'],
            ['24h', 'Horario semanal de 24 horas'],
          ].map(([key, label]) => (
            <label key={key} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.get(key!) === '1'}
                onChange={(e) =>
                  update({ [key!]: e.target.checked ? '1' : '' })
                }
              />
              {label}
            </label>
          ))}
          <p className="text-xs">
            Los filtros se combinan. Una opción no declarada no se considera
            disponible. La apertura no garantiza profesional ni cupo.
          </p>
        </div>
      </dialog>
    </section>
  );
}
