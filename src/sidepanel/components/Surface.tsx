import type { PropsWithChildren } from 'react';

type SurfaceProps = PropsWithChildren<{
  className?: string;
  tone?: 'glass' | 'white' | 'soft';
}>;

export function Surface({ className = '', tone = 'glass', children }: SurfaceProps) {
  return <div className={`surface surface--${tone} ${className}`.trim()}>{children}</div>;
}
