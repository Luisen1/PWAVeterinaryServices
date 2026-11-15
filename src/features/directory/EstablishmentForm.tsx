import { useEffect, useRef, useState } from 'react';
import {
  useFieldArray,
  type UseFormReturn,
  type FieldPath,
} from 'react-hook-form';
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { useZodForm } from '@/lib/forms';
import { useOnline } from '@/pwa/useOnline';
import { acquireReloadBlock } from '@/pwa/reload-safety';
import { AuthField } from '@/features/auth/components/AuthField';
import { submitClass } from '@/features/auth/components/AuthFrame';
import {
  blankEstablishment,
  blankSite,
  categories,
  establishmentSchema,
  paymentMethods,
  weekdays,
  type Establishment,
  type EstablishmentDocument,
} from './model';
import { dataError, submitEstablishment } from './api';
import { MediaUpload } from './Media';
import { cardClass, fieldClass, Notice, secondaryClass } from './Workspace';
import { Icon } from '@/components/ui/Icon';
import { EstablishmentDetails } from './EstablishmentDetails';

type Form = UseFormReturn<EstablishmentDocument>;
export function EstablishmentForm({
  userId,
  establishment,
}: {
  userId: string;
  establishment?: Establishment;
}) {
  const online = useOnline();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const stepLabels = ['Datos', 'Ubicación', 'Contacto', 'Revisión'];
  const uploading = useIsMutating({ mutationKey: ['media-upload'] }) > 0;
  const form = useZodForm(establishmentSchema, {
    mode: 'onSubmit',
    defaultValues: establishment?.document ?? blankEstablishment(),
  });
  const sites = useFieldArray({
    control: form.control,
    name: 'sites',
    keyName: 'formKey',
  });
  const mutation = useMutation({
    mutationFn: (values: EstablishmentDocument) =>
      submitEstablishment(
        establishment?.id ?? null,
        establishment?.revision ?? null,
        values,
      ),
    onSuccess: async () => {
      await Promise.all(
        ['establishments', 'establishment-edit', 'admin-establishments'].map(
          (key) =>
            client.invalidateQueries({ queryKey: [key], refetchType: 'none' }),
        ),
      );
      await navigate('/oferentes?enviado=1');
    },
  });
  useEffect(() => {
    if (!form.formState.isDirty) return;
    const release = acquireReloadBlock('formulario de establecimiento');
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      release();
      window.removeEventListener('beforeunload', warn);
    };
  }, [form.formState.isDirty]);
  const errors = form.formState.errors;
  const disabled = mutation.isPending || uploading;
  async function advance() {
    let fields: FieldPath<EstablishmentDocument>[];
    if (step === 0)
      fields = ['name', 'category', 'responsible_name', 'logo_path'];
    else if (step === 1)
      fields = sites.fields.flatMap((_, i) =>
        (
          [
            'name',
            'address',
            'phone',
            'latitude',
            'longitude',
            'coordinates_confirmed',
            'timezone',
          ] as const
        ).map((key) => `sites.${i}.${key}` as FieldPath<EstablishmentDocument>),
      );
    else fields = ['phone', 'email', 'sites'];
    if (await form.trigger(fields, { shouldFocus: true }))
      setStep((current) => Math.min(3, current + 1));
  }
  useEffect(() => {
    if (step > 0) stepHeading.current?.focus();
  }, [step]);
  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(event) => {
        if (step < 3) {
          event.preventDefault();
          void advance();
        } else
          void form.handleSubmit((values) => mutation.mutate(values))(event);
      }}
    >
      <ol className="wizard-steps" aria-label="Pasos del registro">
        {stepLabels.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? 'step' : undefined}
            className={i < step ? 'is-complete' : ''}
          >
            <span className="wizard-steps__number">
              {i < step ? <Icon name="check" /> : i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
      <h2
        ref={stepHeading}
        tabIndex={-1}
        className="wizard-step-title focus:outline-none"
      >
        Paso {step + 1} de 4 · {stepLabels[step]}
      </h2>
      {establishment && (
        <Notice>
          Enviar cambios crea una nueva revisión. La ficha aprobada permanece
          publicada mientras administración revisa esta versión.
        </Notice>
      )}
      {step === 0 && (
        <fieldset disabled={disabled} className={cardClass}>
          <legend className="px-1 text-lg font-semibold">Datos básicos</legend>
          <AuthField
            label="Nombre del establecimiento"
            required
            {...form.register('name')}
            error={errors.name?.message}
          />
          <label className="block text-sm font-medium">
            Categoría
            <select
              className={`${fieldClass} mt-2`}
              {...form.register('category')}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <AuthField
            label="Nombre del responsable"
            required
            {...form.register('responsible_name')}
            error={errors.responsible_name?.message}
          />
          <p className="text-xs leading-5 text-stone-600">
            El nombre del responsable solo se muestra al titular y a
            administración. El contacto del establecimiento aparecerá en la
            ficha aprobada.
          </p>
          <MediaUpload
            userId={userId}
            label="Logo del establecimiento"
            paths={form.watch('logo_path') ? [form.watch('logo_path')!] : []}
            disabled={mutation.isPending}
            onChange={(paths) =>
              form.setValue('logo_path', paths[0] ?? null, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </fieldset>
      )}
      {step === 1 && (
        <>
          {sites.fields.map((site, index) => (
            <SiteFields
              key={site.formKey}
              form={form}
              index={index}
              userId={userId}
              disabled={disabled}
              part="location"
              remove={
                sites.fields.length > 1 ? () => sites.remove(index) : undefined
              }
            />
          ))}
          <button
            type="button"
            disabled={disabled || sites.fields.length >= 10}
            className={secondaryClass}
            onClick={() => sites.append(blankSite())}
          >
            <Icon name="plus" />
            Añadir sede
          </button>
        </>
      )}
      {step === 2 && (
        <>
          <fieldset disabled={disabled} className={cardClass}>
            <legend className="px-1 text-lg font-semibold">
              Contacto público
            </legend>
            <AuthField
              label="Teléfono del establecimiento"
              type="tel"
              required
              {...form.register('phone')}
              error={errors.phone?.message}
            />
            <AuthField
              label="Correo de contacto público"
              type="email"
              required
              {...form.register('email')}
              error={errors.email?.message}
            />
            <p className="text-xs leading-6 text-stone-600">
              Este contacto aparecerá en la ficha aprobada. Mantén los datos
              actualizados para que puedan localizarte.
            </p>
          </fieldset>
          {sites.fields.map((site, index) => (
            <SiteFields
              key={site.formKey}
              form={form}
              index={index}
              userId={userId}
              disabled={disabled}
              part="details"
            />
          ))}
        </>
      )}
      {step === 3 && (
        <div className={cardClass}>
          <Notice>
            Comprueba los datos antes de enviar. Tu solicitud se revisará antes
            de publicar cualquier cambio.
          </Notice>
          <EstablishmentDetails
            document={form.getValues()}
            updatedAt={establishment?.updated_at ?? new Date().toISOString()}
            showTimestamp={!!establishment}
          />
        </div>
      )}
      {Object.keys(errors).length > 0 && (
        <Notice error>
          Revisa los campos señalados. Los datos que escribiste se conservan.
        </Notice>
      )}
      {mutation.isError && <Notice error>{dataError(mutation.error)}</Notice>}
      <div className="wizard-actions">
        {step > 0 && (
          <button
            type="button"
            className={secondaryClass}
            disabled={disabled}
            onClick={() => setStep((current) => current - 1)}
          >
            <Icon name="back" />
            Anterior
          </button>
        )}
        <button className={submitClass} disabled={!online || disabled}>
          <Icon name={step === 3 ? 'check' : 'arrow'} />
          {mutation.isPending
            ? 'Enviando solicitud…'
            : step < 3
              ? 'Continuar'
              : establishment
                ? 'Enviar cambios a revisión'
                : 'Enviar solicitud de registro'}
        </button>
        <Link to="/oferentes" className={secondaryClass}>
          Cancelar
        </Link>
      </div>
      {step < 3 && (
        <Notice>
          El establecimiento todavía no será visible. Podrás revisar todos los
          datos antes de enviarlos.
        </Notice>
      )}
    </form>
  );
}
function SiteFields({
  form,
  index,
  userId,
  disabled,
  remove,
  part,
}: {
  form: Form;
  index: number;
  userId: string;
  disabled: boolean;
  remove?: () => void;
  part: 'location' | 'details';
}) {
  const hours = useFieldArray({
    control: form.control,
    name: `sites.${index}.hours`,
  });
  const exceptions = useFieldArray({
    control: form.control,
    name: `sites.${index}.exceptions`,
  });
  const errors = form.formState.errors.sites?.[index];
  const lat = form.watch(`sites.${index}.latitude`);
  const lng = form.watch(`sites.${index}.longitude`);
  const photos = form.watch(`sites.${index}.photos`);
  return (
    <fieldset disabled={disabled} className={cardClass}>
      <legend className="px-1 text-lg font-semibold">Sede {index + 1}</legend>
      {part === 'location' && (
        <>
          <AuthField
            label={`Nombre de la sede ${index + 1}`}
            required
            {...form.register(`sites.${index}.name`)}
            error={errors?.name?.message}
          />
          <AuthField
            label={`Dirección de la sede ${index + 1}`}
            required
            {...form.register(`sites.${index}.address`, {
              onChange: () =>
                form.setValue(`sites.${index}.coordinates_confirmed`, false, {
                  shouldDirty: true,
                }),
            })}
            error={errors?.address?.message}
          />
          <AuthField
            label={`Teléfono de la sede ${index + 1}`}
            type="tel"
            required
            {...form.register(`sites.${index}.phone`)}
            error={errors?.phone?.message}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <AuthField
              label={`Latitud de la sede ${index + 1}`}
              type="number"
              step="any"
              {...form.register(`sites.${index}.latitude`, {
                valueAsNumber: true,
                onChange: () =>
                  form.setValue(`sites.${index}.coordinates_confirmed`, false, {
                    shouldDirty: true,
                  }),
              })}
              error={errors?.latitude?.message}
            />
            <AuthField
              label={`Longitud de la sede ${index + 1}`}
              type="number"
              step="any"
              {...form.register(`sites.${index}.longitude`, {
                valueAsNumber: true,
                onChange: () =>
                  form.setValue(`sites.${index}.coordinates_confirmed`, false, {
                    shouldDirty: true,
                  }),
              })}
              error={errors?.longitude?.message}
            />
          </div>
          {Number.isFinite(lat) && Number.isFinite(lng) && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className={secondaryClass}
            >
              Verificar ubicación en el mapa
            </a>
          )}
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-brand-700"
              {...form.register(`sites.${index}.coordinates_confirmed`)}
            />
            Confirmé que las coordenadas corresponden a esta dirección.
          </label>
          {errors?.coordinates_confirmed && (
            <Notice error>{errors.coordinates_confirmed.message}</Notice>
          )}
          <AuthField
            label={`Zona horaria de la sede ${index + 1}`}
            {...form.register(`sites.${index}.timezone`)}
            error={errors?.timezone?.message}
          />
          <p className="text-xs text-stone-600">
            Por ejemplo, America/Bogota. Los horarios se interpretan en esta
            zona.
          </p>
        </>
      )}
      {part === 'details' && (
        <>
          <div className="space-y-3">
            <h3 className="font-semibold">Horario semanal</h3>
            <p className="text-xs text-stone-600">
              Los días sin horario se consideran cerrados. Marca el cruce de
              medianoche cuando el cierre ocurra al día siguiente.
            </p>
            {hours.fields.map((h, i) => (
              <div key={h.id} className="space-y-3 rounded-xl bg-stone-50 p-3">
                <label className="block text-sm">
                  Día
                  <select
                    className={fieldClass}
                    {...form.register(`sites.${index}.hours.${i}.day`, {
                      valueAsNumber: true,
                    })}
                  >
                    {weekdays.map((d, n) => (
                      <option key={d} value={n}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    {...form.register(`sites.${index}.hours.${i}.next_day`)}
                  />
                  Cierra al día siguiente
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <AuthField
                    label="Apertura"
                    type="time"
                    {...form.register(`sites.${index}.hours.${i}.open`)}
                    error={errors?.hours?.[i]?.open?.message}
                  />
                  <AuthField
                    label="Cierre"
                    type="time"
                    {...form.register(`sites.${index}.hours.${i}.close`)}
                    error={errors?.hours?.[i]?.close?.message}
                  />
                </div>
                <button
                  type="button"
                  className={secondaryClass}
                  onClick={() => hours.remove(i)}
                >
                  Quitar horario
                </button>
              </div>
            ))}
            {errors?.hours?.root?.message && (
              <Notice error>{errors.hours.root.message}</Notice>
            )}
            {errors?.hours?.message && (
              <Notice error>{errors.hours.message}</Notice>
            )}
            <button
              type="button"
              className={secondaryClass}
              disabled={hours.fields.length >= 7}
              onClick={() =>
                hours.append({
                  day: hours.fields.length % 7,
                  open: '08:00',
                  close: '18:00',
                  next_day: false,
                })
              }
            >
              Añadir horario
            </button>
          </div>
          <div className="space-y-3">
            <h3 className="font-semibold">Excepciones por fecha</h3>
            {exceptions.fields.map((e, i) => (
              <div key={e.id} className="space-y-3 rounded-xl bg-stone-50 p-3">
                <AuthField
                  label="Fecha de excepción"
                  type="date"
                  {...form.register(`sites.${index}.exceptions.${i}.date`)}
                  error={errors?.exceptions?.[i]?.date?.message}
                />
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    {...form.register(`sites.${index}.exceptions.${i}.closed`)}
                  />
                  Cerrado todo el día
                </label>
                {!form.watch(`sites.${index}.exceptions.${i}.closed`) && (
                  <>
                    <label className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        {...form.register(
                          `sites.${index}.exceptions.${i}.next_day`,
                        )}
                      />
                      Cierre excepcional al día siguiente
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <AuthField
                        label="Apertura excepcional"
                        type="time"
                        {...form.register(
                          `sites.${index}.exceptions.${i}.open`,
                        )}
                      />
                      <AuthField
                        label="Cierre excepcional"
                        type="time"
                        {...form.register(
                          `sites.${index}.exceptions.${i}.close`,
                        )}
                        error={errors?.exceptions?.[i]?.close?.message}
                      />
                    </div>
                  </>
                )}
                <button
                  type="button"
                  className={secondaryClass}
                  onClick={() => exceptions.remove(i)}
                >
                  Quitar excepción
                </button>
              </div>
            ))}
            {errors?.exceptions?.root?.message && (
              <Notice error>{errors.exceptions.root.message}</Notice>
            )}
            {errors?.exceptions?.message && (
              <Notice error>{errors.exceptions.message}</Notice>
            )}
            <button
              type="button"
              className={secondaryClass}
              disabled={exceptions.fields.length >= 100}
              onClick={() =>
                exceptions.append({
                  date: '',
                  closed: true,
                  open: '08:00',
                  close: '18:00',
                  next_day: false,
                })
              }
            >
              Añadir excepción
            </button>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-3 font-semibold">Medios de pago</legend>
            {paymentMethods.map((m) => (
              <label key={m} className="flex gap-3 text-sm">
                <input
                  type="checkbox"
                  value={m}
                  {...form.register(`sites.${index}.payment_methods`)}
                />
                {m}
              </label>
            ))}
            {errors?.payment_methods && (
              <Notice error>{errors.payment_methods.message}</Notice>
            )}
          </fieldset>
          <MediaUpload
            multiple
            userId={userId}
            label={`Fotos de la sede ${index + 1}`}
            paths={photos}
            disabled={disabled}
            onChange={(values) =>
              form.setValue(`sites.${index}.photos`, values, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </>
      )}
      {remove && (
        <button type="button" className={secondaryClass} onClick={remove}>
          Eliminar sede {index + 1}
        </button>
      )}
    </fieldset>
  );
}
