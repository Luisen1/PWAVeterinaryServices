import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { completeAuthCallback } from '@/features/auth/callback';
import { AuthFrame } from '@/features/auth/components/AuthFrame';

export function ConfirmEmailPage() {
  const { search } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    void completeAuthCallback(search)
      .then((destination) => {
        if (active) void navigate(destination, { replace: true });
      })
      .catch(() => {
        if (active)
          void navigate('/acceso?aviso=enlace-invalido', { replace: true });
      });
    return () => {
      active = false;
    };
  }, [search, navigate]);
  return (
    <AuthFrame
      title="Verificando enlace"
      description="Estamos comprobando el enlace de tu correo."
    >
      <p role="status" className="text-sm text-stone-600">
        Espera un momento…
      </p>
    </AuthFrame>
  );
}
