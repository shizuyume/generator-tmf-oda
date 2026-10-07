import { useState } from 'react';
import ResourceDetailPage from './ResourceDetailPage';
import ResourceListPage from './ResourceListPage';
import type { ResourceConfig } from './types';

// One resource page: the list, and — when the config has a detail — the record page in its
// place (local state, router-agnostic, as the MFE seam expects).
export default function ResourcePage({ config }: Readonly<{ config: ResourceConfig }>) {
  const [detailId, setDetailId] = useState<string | null>(null);

  if (config.detail && detailId) {
    return <ResourceDetailPage config={config} id={detailId} onBack={() => setDetailId(null)} />;
  }

  return <ResourceListPage config={config} onViewDetail={config.detail ? setDetailId : undefined} />;
}
