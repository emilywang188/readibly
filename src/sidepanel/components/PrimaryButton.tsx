import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';

type PrimaryButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: ReactNode;
    label?: string;
  }
>;

export function PrimaryButton({ icon, label, children, className = '', ...props }: PrimaryButtonProps) {
  return (
    <button className={`primary-button ${className}`.trim()} {...props}>
      {icon ? <span className="primary-button__icon">{icon}</span> : null}
      <span>{label ?? children}</span>
    </button>
  );
}
