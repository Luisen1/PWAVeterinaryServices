import { Link } from 'react-router';
import { Icon, type IconName } from '@/components/ui/Icon';
import { SectionHeading } from '@/components/ui/PageHeading';
import { canUseArea, type AccountContext } from '../account-types';

type Entry = { to: string; title: string; help: string; icon: IconName };
function Menu({
  title,
  icon,
  entries,
}: {
  title: string;
  icon: IconName;
  entries: Entry[];
}) {
  return (
    <section>
      <SectionHeading icon={icon}>{title}</SectionHeading>
      <div className="account-menu">
        {entries.map((entry) => (
          <Link key={entry.to} to={entry.to} aria-label={entry.title}>
            <Icon name={entry.icon} className="account-menu__icon" />
            <span className="account-menu__text">
              <strong>{entry.title}</strong>
              <small>{entry.help}</small>
            </span>
            <Icon name="chevron" className="chevron" />
          </Link>
        ))}
      </div>
    </section>
  );
}
export function AccountMenu({ context }: { context: AccountContext }) {
  const owner = canUseArea(context, 'pet_owner');
  const veterinary = canUseArea(context, 'veterinary');
  const personal: Entry[] = [
    {
      to: '/perfil',
      title: 'Mi perfil',
      help: 'Actualiza tus datos de contacto',
      icon: 'user',
    },
    ...(owner
      ? [
          {
            to: '/perfil#mascotas',
            title: 'Mis mascotas',
            help: 'Administra a tus compañeros de vida',
            icon: 'paw' as const,
          },
        ]
      : []),
    {
      to: '/notificaciones',
      title: 'Mis notificaciones',
      help: 'Cambios de citas, mensajes y recordatorios',
      icon: 'bell',
    },
    {
      to: '/cuenta/pendientes',
      title: 'Pendientes y sincronización',
      help: 'Borradores, mensajes, archivos y conflictos',
      icon: 'refresh',
    },
    {
      to: '/cuenta/notificaciones',
      title: 'Notificaciones del dispositivo',
      help: 'Activa o desactiva avisos para esta cuenta',
      icon: 'bell',
    },
    {
      to: '/privacidad',
      title: 'Privacidad y datos',
      help: 'Conoce cómo protegemos tu información',
      icon: 'shield',
    },
  ];
  const entries: Entry[] = owner
    ? [
        {
          to: '/favoritos',
          title: 'Favoritos y notas privadas',
          help: 'Consulta tus establecimientos guardados',
          icon: 'heart',
        },
        {
          to: '/citas/agenda',
          title: 'Mi agenda e historial',
          help: 'Consulta y gestiona tus citas',
          icon: 'calendar',
        },
        {
          to: '/citas/solicitudes',
          title: 'Mis citas y solicitudes',
          help: 'Pendientes, confirmadas, respuestas y chat',
          icon: 'calendar',
        },
        {
          to: '/mensajes',
          title: 'Mis conversaciones',
          help: 'Fotos, voz y mensajes con tu veterinaria',
          icon: 'store',
        },
      ]
    : veterinary
      ? [
          {
            to: '/oferentes',
            title: 'Mis establecimientos',
            help: 'Consulta solicitudes y fichas publicadas',
            icon: 'store',
          },
          {
            to: '/oferentes/nuevo',
            title: 'Registrar mi establecimiento',
            help: 'Envía tu veterinaria a revisión',
            icon: 'plus',
          },
          {
            to: '/oferentes/servicios',
            title: 'Servicios y disponibilidad',
            help: 'Catálogo, equipo, horarios e invitaciones',
            icon: 'calendar',
          },
          ...(context.can_read_appointments
            ? [
                {
                  to: '/oferentes/agenda',
                  title: 'Agenda del establecimiento',
                  help: 'Consulta la atención y su historial',
                  icon: 'calendar' as const,
                },
                {
                  to: '/oferentes/citas',
                  title: 'Solicitudes del establecimiento',
                  help: 'Gestiona solicitudes según tus permisos',
                  icon: 'calendar' as const,
                },
              ]
            : []),
          ...(context.can_message_team
            ? [
                {
                  to: '/oferentes/mensajes',
                  title: 'Chats del establecimiento',
                  help: 'Atiende conversaciones autorizadas',
                  icon: 'store' as const,
                },
              ]
            : []),
        ]
      : [
          {
            to: '/administracion/oferentes',
            title: 'Revisar solicitudes de oferentes',
            help: 'Panel de revisión administrativa',
            icon: 'shield',
          },
        ];
  return (
    <div className="account-grid">
      <Menu title="Mi cuenta" icon="user" entries={personal} />
      <Menu
        title={
          owner
            ? 'Cuidado de mis mascotas'
            : veterinary
              ? 'Mi veterinaria'
              : 'Administración'
        }
        icon={owner ? 'paw' : veterinary ? 'store' : 'shield'}
        entries={entries}
      />
    </div>
  );
}
