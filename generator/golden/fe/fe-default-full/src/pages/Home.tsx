import { Home as HomeIcon } from 'lucide-react';
import { Card } from '../components/Card';
import { t } from '../gen/i18n';

/** Halaman uji scaffold: empty placeholder. Emitter list/form/detail menambah halaman nyata. */
export default function HomePage() {
  return (
    <div className="p-0">
      <h2 className="mb-4 text-2xl font-semibold text-text-primary" data-testid="home-title">
        {t('page.home')}
      </h2>
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <HomeIcon size={18} strokeWidth={1.75} />
          <span className="text-text-secondary">{t('appTitle')}</span>
        </div>
      </Card>
    </div>
  );
}
