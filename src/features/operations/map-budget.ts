import { supabase } from '@/lib/supabase';
import { reportTechnicalFault } from './telemetry';
export class MapOperationError extends Error {}
export async function authorizeMapOperation(kind: 'map' | 'route') {
  if (!supabase || !navigator.onLine)
    throw new MapOperationError(
      'No pudimos comprobar el límite de mapas. Usa el listado o las indicaciones externas.',
    );
  const { data, error } = await supabase.rpc('claim_map_operation', {
    p_id: crypto.randomUUID(),
    p_kind: kind,
  });
  if (error || data?.allowed !== true) {
    reportTechnicalFault('map', data?.allowed === false ? 'quota' : 'network');
    throw new MapOperationError(
      data?.allowed === false
        ? 'Se alcanzó el límite diario de mapas o rutas de la aplicación. Puedes usar el listado y las indicaciones externas.'
        : 'No pudimos comprobar la disponibilidad de mapas. Reintenta o usa el listado.',
    );
  }
}
