import { authClient, withAuthOperation } from '@/features/auth/api';
import { z } from 'zod';
import {
  establishmentSchema,
  petSchema,
  profileSchema,
  type EstablishmentDocument,
  type Pet,
} from './model';

export function dataError(error: unknown): string {
  if (error instanceof z.ZodError)
    return 'Revisa los datos obligatorios antes de guardar.';
  if (error instanceof TypeError)
    return 'No se pudo conectar. Revisa tu conexión y vuelve a intentarlo.';
  if (error instanceof Error && error.name === 'Error' && !('code' in error))
    return error.message;
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (code === '40001')
      return 'La información cambió en otra sesión. Recarga antes de continuar.';
    if (code === '42501')
      return 'No tienes permiso para realizar esta operación. Verifica tu cuenta y tu rol.';
    if (code === '23514' && 'message' in error) return String(error.message);
  }
  return 'No pudimos guardar o consultar los datos. Revisa la conexión e inténtalo de nuevo.';
}
export async function saveProfile(userId: string, values: unknown) {
  const payload = profileSchema.parse(values);
  const { error } = await authClient()
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select('id')
    .single();
  if (error) throw error;
}
export async function listPets(userId: string, signal: AbortSignal) {
  const { data, error } = await authClient()
    .from('pets')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at')
    .abortSignal(signal);
  if (error) throw error;
  return data as Pet[];
}

export async function savePet(
  userId: string,
  pet: Pick<Pet, 'id' | 'name' | 'species'>,
) {
  const payload = petSchema.parse(pet);
  // La RPC hace un upsert idempotente sin conceder cambios de propietario.
  const { error } = await authClient().rpc('save_pet', {
    p_id: pet.id,
    p_owner: userId,
    p_name: payload.name,
    p_species: payload.species,
  });
  if (error) throw error;
}
export async function submitEstablishment(
  id: string | null,
  revision: number | null,
  document: EstablishmentDocument,
) {
  return withAuthOperation(async () => {
    const { data, error } = await authClient().rpc('submit_establishment', {
      p_id: id,
      p_revision: revision,
      p_document: establishmentSchema.parse(document),
    });
    if (error) throw error;
    return data as string;
  });
}
export async function validateImage(file: File) {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 2 * 1024 * 1024 ||
    file.size === 0
  )
    throw new Error('Usa una imagen JPEG, PNG o WebP de hasta 2 MB.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png =
    file.type === 'image/png' &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const jpg =
    file.type === 'image/jpeg' &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255;
  const webp =
    file.type === 'image/webp' &&
    new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  if (!png && !jpg && !webp)
    throw new Error(
      'El contenido del archivo no corresponde a una imagen admitida.',
    );
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('No se pudo leer la imagen. Selecciona otro archivo.');
  });
  const tooLarge = bitmap.width > 10000 || bitmap.height > 10000;
  bitmap.close();
  if (tooLarge)
    throw new Error('La imagen no puede superar 10000 píxeles por lado.');
}
export async function uploadImage(userId: string, file: File) {
  return withAuthOperation(async () => {
    await validateImage(file);
    const extension = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    }[file.type];
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await authClient()
      .storage.from('establishment-media')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return path;
  });
}
