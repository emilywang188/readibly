import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

type SurfaceProps = ComponentPropsWithoutRef<'div'> & {
  tone?: 'glass' | 'white' | 'soft';
};

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className = '', tone = 'glass', children, ...rest }, ref) => (
    <div ref={ref} className={`surface surface--${tone} ${className}`.trim()} {...rest}>
      {children}
    </div>
  )
);
Surface.displayName = 'Surface';
