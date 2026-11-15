import { Link } from 'react-router';
import emblem from '@/assets/brand/Emblema-de-corazón-con-perro-y-gato.svg';

export function BrandSymbol({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`brand-symbol ${className}`}
      style={{
        maskImage: `url("${emblem}")`,
        WebkitMaskImage: `url("${emblem}")`,
      }}
    />
  );
}

export function Brand({ large = false }: { large?: boolean }) {
  return (
    <Link
      to="/"
      aria-label="Servicios veterinarios, inicio"
      className={`brand ${large ? 'brand--large' : ''}`}
    >
      <BrandSymbol />
      <span className="brand__divider" aria-hidden="true" />
      <span className="brand__name">
        Servicios
        <br />
        Veterinarios
      </span>
    </Link>
  );
}
