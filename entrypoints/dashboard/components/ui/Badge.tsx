import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'ok'; children: ReactNode }) {
  return <span className={cx('badge', `badge-${tone}`)}>{children}</span>;
}
