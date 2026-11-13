import { cx } from '../../lib/cx';
import { Icon, type IconName } from './Icon';

interface Option<T extends string> {
  value: T;
  label?: string;
  icon?: IconName;
}

/** Selector de opciones en una barra (tabla / cuadrícula, etc.). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cx('seg-btn', o.value === value && 'is-active')}
          title={o.label}
          aria-label={o.label}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={15} />}
          {!o.icon && o.label}
        </button>
      ))}
    </div>
  );
}
