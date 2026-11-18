import { useId, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { authClient } from '@/features/auth/api';
import { useOnline } from '@/pwa/useOnline';
import { dataError, uploadImage } from './api';
import { Notice, secondaryClass } from './Workspace';
import { Icon } from '@/components/ui/Icon';

export function MediaImage({
  path,
  alt,
}: {
  path: string | null;
  alt: string;
}) {
  const online = useOnline();
  const [failed, setFailed] = useState<string | null>(null);
  const image = useQuery({
    queryKey: ['media', path],
    enabled: !!path && online,
    staleTime: 240000,
    gcTime: 240000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await authClient()
        .storage.from('establishment-media')
        .createSignedUrl(path!, 300);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  return (
    <div className="space-y-1">
      {online && image.data && failed !== image.data ? (
        <img
          src={image.data}
          alt={alt}
          className="media-image"
          width={96}
          height={96}
          onError={() => setFailed(image.data!)}
        />
      ) : (
        <div
          role="img"
          aria-label={alt}
          className="media-image media-placeholder"
        >
          <Icon name="store" />
        </div>
      )}
      {(image.isError || !!failed || (!online && !!path)) && (
        <span className="text-xs text-amber-900">Imagen no disponible</span>
      )}
    </div>
  );
}
export function MediaUpload({
  userId,
  label,
  paths,
  onChange,
  multiple = false,
  disabled = false,
}: {
  userId: string;
  label: string;
  paths: string[];
  onChange: (paths: string[]) => void;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const online = useOnline();
  const upload = useMutation({
    mutationKey: ['media-upload'],
    mutationFn: async (files: File[]) => {
      if (files.length + (multiple ? paths.length : 0) > (multiple ? 8 : 1))
        throw new Error('Puedes añadir hasta ocho fotos por sede y un logo.');
      const result: string[] = [];
      for (const file of files) result.push(await uploadImage(userId, file));
      return result;
    },
    onSuccess: (values) => onChange(multiple ? [...paths, ...values] : values),
  });
  return (
    <div className="upload-control space-y-3">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <p className="text-xs text-stone-600">
        JPEG, PNG o WebP. Hasta 2 MB por imagen.{' '}
        {multiple
          ? 'Máximo ocho fotos.'
          : 'Sin logo se muestra la imagen predeterminada.'}
      </p>
      <div className="flex flex-wrap gap-3">
        {paths.length === 0 && !multiple && (
          <MediaImage path={null} alt="Logo predeterminado" />
        )}
        {paths.map((path) => (
          <div key={path} className="space-y-2">
            <MediaImage path={path} alt={label} />
            <button
              type="button"
              disabled={disabled || upload.isPending}
              className={secondaryClass}
              onClick={() => onChange(paths.filter((v) => v !== path))}
            >
              Quitar imagen
            </button>
          </div>
        ))}
      </div>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        disabled={!online || disabled || upload.isPending}
        className="block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-100 file:px-3 file:py-3 file:text-brand-900"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) upload.mutate(files);
          event.target.value = '';
        }}
      />
      {upload.isPending && <Notice>Subiendo y preparando vista previa…</Notice>}
      {upload.isError && <Notice error>{dataError(upload.error)}</Notice>}
    </div>
  );
}
