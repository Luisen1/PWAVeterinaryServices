import { useId, type ComponentPropsWithRef } from 'react';

type AuthFieldProps = ComponentPropsWithRef<'input'> & {
  label: string;
  error?: string;
};

export function AuthField({ label, error, id, ...props }: AuthFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-2 block text-sm font-medium text-stone-800"
      >
        {label}
      </label>
      <input
        {...props}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className="min-h-12 w-full min-w-0 rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-base text-stone-900 placeholder:text-stone-400 focus:border-brand-700 disabled:bg-stone-50 disabled:text-stone-500 aria-invalid:border-red-700"
      />
      {error && (
        <p id={`${inputId}-error`} className="mt-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
