import { useId, useState, type ComponentPropsWithRef } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';

type AuthFieldProps = ComponentPropsWithRef<'input'> & {
  label: string;
  error?: string;
};

export function AuthField({
  label,
  error,
  id,
  type,
  ...props
}: AuthFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const password = type === 'password';
  const icon: IconName | undefined = password
    ? 'lock'
    : type === 'email'
      ? 'mail'
      : type === 'tel'
        ? 'phone'
        : undefined;
  return (
    <div>
      <label htmlFor={inputId} className="sv-label">
        {label}
      </label>
      <div
        className={`input-wrap ${icon ? 'input-wrap--icon' : ''} ${password ? 'input-wrap--password' : ''}`}
      >
        {icon && <Icon name={icon} className="input-icon" />}
        <input
          {...props}
          id={inputId}
          type={password && visible ? 'text' : type}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="sv-input"
        />
        {password && (
          <button
            type="button"
            aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`}
            aria-pressed={visible}
            aria-controls={inputId}
            className="password-toggle"
            disabled={props.disabled}
            onClick={() => setVisible((v) => !v)}
          >
            <Icon name={visible ? 'eyeOff' : 'eye'} />
          </button>
        )}
      </div>
      {error && (
        <p id={`${inputId}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
