export function installGuidance(
  agent: string,
  platform: string,
  touchPoints: number,
) {
  const ios =
    /iPad|iPhone|iPod/.test(agent) ||
    (platform === 'MacIntel' && touchPoints > 1);
  const safari =
    /Safari/.test(agent) && !/Chrome|Chromium|CriOS|Edg|FxiOS|OPR/.test(agent);
  if (ios)
    return {
      title: 'Instalar en iPhone o iPad',
      steps: [
        safari
          ? 'En Safari, abre el menú Compartir de esta página.'
          : 'Abre esta misma dirección en Safari y toca Compartir.',
        'Selecciona Añadir a pantalla de inicio. Si aparece Abrir como app, déjalo activado.',
        'Confirma el nombre y toca Añadir. Abre el icono Servicios veterinarios.',
      ],
    };
  if (/Android/.test(agent))
    return {
      title: 'Instalar en Android',
      steps: [
        'Abre el menú de tu navegador.',
        'Busca Instalar aplicación o Añadir a pantalla de inicio y confirma si se ofrece.',
        'Abre el icono Servicios veterinarios. Si no aparece la opción, prueba con Chrome actualizado.',
      ],
    };
  if (safari && /Mac/.test(platform))
    return {
      title: 'Instalar en Mac con Safari',
      steps: [
        'En Safari compatible, abre Archivo o Compartir.',
        'Selecciona Añadir al Dock y confirma el nombre.',
        'Abre Servicios veterinarios desde el Dock. Si no aparece esa opción, actualiza Safari o usa Chrome o Edge.',
      ],
    };
  if (/Firefox/.test(agent))
    return {
      title: 'Abrir desde el computador',
      steps: [
        'Si Firefox no ofrece instalar este sitio como aplicación, abre esta dirección en Chrome o Edge.',
        'En el navegador compatible, busca el icono de instalación de la barra de direcciones o Instalar en su menú.',
        'Confirma la instalación y abre Servicios veterinarios desde el acceso creado.',
      ],
    };
  return {
    title: 'Instalar en el computador',
    steps: [
      'En Chrome o Edge, busca el icono de instalación en la barra de direcciones o la opción Instalar en el menú.',
      'Confirma la instalación cuando el navegador la ofrezca.',
      'Abre Servicios veterinarios desde el acceso creado. Si tu navegador no ofrece instalar, puedes seguir usando esta página.',
    ],
  };
}
