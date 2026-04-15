import type { PanelTab } from '../../shared/types';
import { MessageIcon, SettingsIcon, SparkIcon } from './icons';

type TabRailProps = {
  activeTab: PanelTab;
  onChange: (tab: PanelTab) => void;
};

const tabs: Array<{ id: PanelTab; label: string; icon: typeof SparkIcon }> = [
  { id: 'summary', label: 'Summary', icon: SparkIcon },
  { id: 'chat', label: 'Chat', icon: MessageIcon },
  { id: 'settings', label: 'Settings', icon: SettingsIcon }
];

export function TabRail({ activeTab, onChange }: TabRailProps) {
  return (
    <aside className="tab-rail" aria-label="Readibly navigation">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={`tab-rail__button ${activeTab === id ? 'is-active' : ''}`.trim()}
          onClick={() => onChange(id)}
          aria-pressed={activeTab === id}
        >
          <Icon className="tab-rail__icon" />
          <span>{label}</span>
        </button>
      ))}
    </aside>
  );
}
