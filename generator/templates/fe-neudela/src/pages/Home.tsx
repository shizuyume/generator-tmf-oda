import { Home as HomeIcon } from 'lucide-react';
import { t } from '../gen/i18n';

/** Halaman uji scaffold: empty placeholder. Emitter list/form/detail menambah halaman nyata. */
export default function HomePage() {
  return (
    <UiBoxHome />
  );
}

function UiBoxHome() {
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }} data-testid="home-title">{t('page.home')}</h2>
      <div className="neuron-card neuron-card--default">
        <div className="neuron-card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <HomeIcon size={18} />
          <span style={{ color: 'var(--color-text-secondary)' }}>{t('appTitle')}</span>
        </div>
      </div>
    </div>
  );
}
