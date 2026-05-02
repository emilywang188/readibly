import type { CSSProperties, ReactNode } from 'react';
import { Surface } from './Surface';

type FeatureCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
  iconStyle?: CSSProperties;
};

export function FeatureCard({ icon, title, description, iconStyle }: FeatureCardProps) {
  return (
    <Surface tone="white" className="feature-card">
      <div className="feature-card__icon" style={iconStyle}>{icon}</div>
      <div className="feature-card__content">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </Surface>
  );
}
