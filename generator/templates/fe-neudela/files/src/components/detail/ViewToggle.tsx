import { LayoutGrid, List } from 'lucide-react';
import { NeuronButtonGroup } from 'neudela';
import './Detail.css';

export type ViewMode = 'card' | 'table';

// Card / table switch for an embedded list (kept from the first lab version).
export default function ViewToggle({ value, onChange }: Readonly<{ value: ViewMode; onChange: (v: ViewMode) => void }>) {
  return (
    <NeuronButtonGroup
      type="radio"
      size="sm"
      ariaLabel="View mode"
      className="dt-view-toggle"
      value={value}
      onChange={(v: ViewMode) => onChange(v)}
      options={[
        { value: 'card', icon: <LayoutGrid size={16} />, iconOnly: true, ariaLabel: 'Card view' },
        { value: 'table', icon: <List size={16} />, iconOnly: true, ariaLabel: 'Table view' },
      ]}
    />
  );
}
