import { Link } from 'react-router';
import { Icon, type IconName } from './Icon';

export function PageHeading({
  title,
  description,
  icon = 'heart',
  backTo,
  backLabel = 'Volver a Cuenta',
}: {
  title: string;
  description?: string;
  icon?: IconName;
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <div className="page-heading">
      {backTo && (
        <Link to={backTo} className="back-link">
          <Icon name="back" />
          <span>{backLabel}</span>
        </Link>
      )}
      <div className="page-heading__title">
        <span className="heading-icon">
          <Icon name={icon} />
        </span>
        <h1>{title}</h1>
        <span className="heading-rays" aria-hidden="true" />
      </div>
      {description && (
        <p className="page-heading__description">{description}</p>
      )}
    </div>
  );
}

export function SectionHeading({
  children,
  icon = 'heart',
}: {
  children: React.ReactNode;
  icon?: IconName;
}) {
  return (
    <h2 className="section-heading">
      <Icon name={icon} />
      <span>{children}</span>
    </h2>
  );
}
