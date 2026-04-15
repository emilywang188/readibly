import type { ReactNode } from 'react';
import { Surface } from './Surface';

type FeatureCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
};

export function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <Surface tone="white" className="feature-card">
      <div className="feature-card__icon">{icon}</div>
      <div className="feature-card__content">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </Surface>
  );
}
