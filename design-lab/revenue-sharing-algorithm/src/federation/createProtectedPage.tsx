import React, { Suspense, ComponentType } from 'react';

interface ProtectedPageOptions {
  pageName: string;
}

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
        <div style={{ padding: 24, textAlign: 'center' }}>
          <h3>Failed to load {this.props.pageName}</h3>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Retry
          </button>
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
      <Suspense fallback={<div style={{ padding: 24 }}>Loading {options.pageName}...</div>}>
        <LazyComponent {...props} />
      </Suspense>
    </ErrorBoundary>
  );

  ProtectedPage.displayName = `Protected(${options.pageName})`;
  return ProtectedPage;
}
