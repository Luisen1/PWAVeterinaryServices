const messages: Record<string, string> = {
  push_unlink_required:
    'Recupera la conexión y revalida la sesión para desvincular las notificaciones antes de cerrar sesión. Tus datos se conservan.',
  invalid_credentials: 'El correo o la contraseña son incorrectos.',
  email_not_confirmed:
    'Confirma tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.',
  user_already_exists:
    'Esta cuenta ya está registrada. Puedes iniciar sesión o recuperar el acceso.',
  email_exists:
    'Esta cuenta ya está registrada. Puedes iniciar sesión o recuperar el acceso.',
  weak_password:
    'La contraseña no cumple los requisitos. Usa al menos 8 caracteres.',
  same_password: 'Elige una contraseña diferente a la anterior.',
  otp_expired: 'El enlace venció o ya fue utilizado. Solicita uno nuevo.',
  flow_state_expired:
    'El enlace venció. Solicita uno nuevo desde este navegador.',
  flow_state_not_found:
    'El enlace venció o ya fue utilizado. Solicita uno nuevo.',
  bad_code_verifier:
    'Abre el enlace en el mismo navegador donde lo solicitaste o pide uno nuevo.',
  validation_failed: 'Revisa los datos introducidos y vuelve a intentarlo.',
  over_email_send_rate_limit:
    'Se alcanzó el límite de correos. Espera antes de solicitar otro enlace.',
  over_request_rate_limit:
    'Has realizado varios intentos. Espera un momento y vuelve a intentarlo.',
  email_address_not_authorized:
    'El envío a este correo requiere configurar el servicio de correo del proyecto.',
  signup_disabled: 'El registro está temporalmente deshabilitado.',
};

export function authErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    const message = messages[error.code];
    if (message) return message;
  }
  if (
    error instanceof TypeError ||
    (error instanceof Error && error.name === 'AuthRetryableFetchError')
  ) {
    return 'No se pudo conectar. Revisa tu conexión y vuelve a intentarlo.';
  }
  return 'No pudimos completar la operación. Vuelve a intentarlo en unos momentos.';
}
