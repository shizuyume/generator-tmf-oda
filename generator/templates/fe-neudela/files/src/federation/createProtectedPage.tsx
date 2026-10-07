import React, { Suspense, type ComponentType } from 'react';
import { NeuronAlert } from 'neudela';
// A page loaded by a federation host brings the styles it is built on (the full app has already
// loaded them in bootstrap / App, in this order, so its cascade is unchanged). The template's
// tokens (:root, .dark-theme) and base styles are global — the host is expected to use neudela.
import 'neudela/style.css';
import '../index.css';
import '../App.css';

interface ProtectedPageOptions {
  pageName: string;
}

// Same contract as design-lab/revenue-sharing-algorithm: every page is lazy and
// wrapped in an error boundary, so a page crash (or, once federated, a failed
// remote load) degrades to a retryable message instead of taking the shell down.
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; pageName: string },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="lab-page">
          <NeuronAlert
            variant="danger"
            title={`Failed to load ${this.props.pageName}`}
            description={this.state.error?.message}
            actions={[{ label: 'Retry', onClick: () => this.setState({ hasError: false, error: null }) }]}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

export function createProtectedPage(
  factory: () => Promise<{ default: ComponentType<any> }>,
  options: ProtectedPageOptions,
): ComponentType<any> {
  const LazyComponent = React.lazy(factory);

  const ProtectedPage: React.FC = (props) => (
    <ErrorBoundary pageName={options.pageName}>
      <Suspense fallback={<div className="lab-page lab-muted">Loading {options.pageName}…</div>}>
        <LazyComponent {...props} />
      </Suspense>
    </ErrorBoundary>
  );

  ProtectedPage.displayName = `Protected(${options.pageName})`;
  return ProtectedPage;
}
