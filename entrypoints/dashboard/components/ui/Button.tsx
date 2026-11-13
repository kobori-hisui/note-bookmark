import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import { Icon, type IconName } from './Icon';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: IconName;
}

export function Button({ variant = 'default', size = 'md', icon, className, children, ...rest }: Props) {
  return (
    <button type="button" className={cx('btn', `btn-${variant}`, `btn-${size}`, className)} {...rest}>
      {icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

/** Botón cuadrado solo con ícono. `label` es obligatorio (accesibilidad + tooltip). */
export function IconButton({
  icon,
  label,
  danger,
  className,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { icon: IconName; label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      className={cx('icon-btn', danger && 'icon-btn-danger', className)}
      title={label}
      aria-label={label}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}
