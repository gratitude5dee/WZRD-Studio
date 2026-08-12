import { Component, createContext, useContext, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface TabErrorReport {
  /** Where the failure happened, e.g. `CastTab.generateAllImages`. */
  source: string;
  error: unknown;
}

type TabErrorReporter = (report: TabErrorReport) => void;

const defaultReporter: TabErrorReporter = ({ source, error }) => {
  console.error(`[project-setup] ${source} failed`, error);
};

const TabErrorReporterContext = createContext<TabErrorReporter>(defaultReporter);

/**
 * Report a handled (non-fatal) failure to the surrounding tab error boundary.
 * Components that render their own inline error UI should still report here so
 * failures are never silent.
 */
export const useTabErrorReporter = (): TabErrorReporter => useContext(TabErrorReporterContext);

interface TabErrorBoundaryState {
  hasError: boolean;
}

export class TabErrorBoundary extends Component<{ children: ReactNode }, TabErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[project-setup] tab render failed', error, info.componentStack);
  }

  reportError = ({ source, error }: TabErrorReport) => {
    console.error(`[project-setup] ${source} failed`, error);
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <AlertCircle className="h-12 w-12 text-status-warning" />
          <p className="text-muted-foreground">Failed to load this section</p>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Reload Page
          </Button>
        </div>
      );
    }
    return (
      <TabErrorReporterContext.Provider value={this.reportError}>
        {this.props.children}
      </TabErrorReporterContext.Provider>
    );
  }
}

export default TabErrorBoundary;
