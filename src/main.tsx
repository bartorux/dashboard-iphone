import { StrictMode, Component, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { RefreshIcon } from './components/icons';
import './App.css';

/**
 * The last screen this app can still draw.
 *
 * It used to be written in inline styles with a hard-coded #e74c3c — a red from
 * no palette in this project, on a white that was really "whatever the browser
 * defaults to". In dark mode it was black text with no background of its own;
 * on a phone it ran under the notch. All three are the same mistake: the one
 * screen shown when everything else has failed was the one screen not built out
 * of the design system it is meant to represent.
 *
 * The message takes --alarm-text and nothing else. An alarm-coloured PANEL is
 * this app's vocabulary for the grid being in trouble (AlertsPanel, the header
 * bar), and a crash in our own JavaScript says nothing whatsoever about the
 * power system. Red ink on the ordinary surface reads as "this text is the
 * failure", which is true; a red card would have read as "the grid is in
 * trouble", which is not.
 */
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen bg-bg text-text"
          /* The header normally owns the top inset (see its comment) and the
             page bottom owns its own. Neither is mounted here, so this screen
             has to carry all four itself — otherwise the card slides under the
             notch on the very screen a reader is trying to read carefully. */
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            paddingLeft: 'env(safe-area-inset-left)',
            paddingRight: 'env(safe-area-inset-right)',
          }}
        >
          <section className="mx-3 mt-3 rounded-2xl bg-surface p-4 shadow-sm">
            <h1 className="text-[1.0625rem] font-semibold">Błąd aplikacji</h1>
            <p className="mt-1 text-[0.8125rem] text-text-secondary">
              Ekran się nie wczytał. To awaria samej aplikacji — nie mówi nic o
              stanie systemu elektroenergetycznego. Odświeżenie zwykle wystarcza.
            </p>
            {this.state.error?.message && (
              <p className="mt-2 text-[0.8125rem] text-alarm-text">
                {this.state.error.message}
              </p>
            )}
          </section>

          {/* Same button as "Odśwież" in App.tsx, down to the 44pt minimum
              height — one refresh control, one shape, wherever it appears. It
              sits on the page background rather than inside the card above so
              its bg-surface still reads as a raised control. */}
          <div className="mx-3 mt-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-surface px-4 text-[0.9375rem] font-medium text-accent-text shadow-sm active:opacity-70"
            >
              <RefreshIcon className="h-4 w-4" />
              Odśwież stronę
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
