import type { ReactNode } from 'react';
import { NeuronBreadcrumb } from 'neudela';
import type { BreadcrumbItem } from 'neudela';
import CopyButton from './CopyButton';
import './Detail.css';

interface Props {
  /** Ancestors → current. The current (last) crumb is the record name (the id sits next to the title). */
  breadcrumbs: BreadcrumbItem[];
  title: string;
  /** Record id next to the title, with a copy button. */
  recordId?: string;
  /** Status / type badges after the title. */
  badges?: ReactNode;
  description?: string;
  actions?: ReactNode;
}

// Record header (Neudela Logistics Dashboard › shipment detail): breadcrumb ending in the
// record name, title + badges + copyable mono id, one-line summary, and actions on the right.
export default function DetailHeader({ breadcrumbs, title, recordId, badges, description, actions }: Readonly<Props>) {
  return (
    <header className="dt-header">
      <NeuronBreadcrumb items={breadcrumbs} className="dt-header__crumbs" />
      <div className="dt-header__row">
        <div className="dt-header__main">
          <div className="dt-header__title-row">
            <h1 className="dt-header__title">{title}</h1>
            {badges}
            {recordId && (
              <span className="dt-header__id">
                <span className="dt-header__id-text" title={recordId}>{recordId}</span>
                <CopyButton value={recordId} />
              </span>
            )}
          </div>
          {description && <p className="dt-header__desc">{description}</p>}
        </div>
        {actions && <div className="dt-header__actions">{actions}</div>}
      </div>
    </header>
  );
}
