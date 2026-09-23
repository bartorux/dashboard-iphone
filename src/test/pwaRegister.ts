/**
 * Stand-in for `virtual:pwa-register/react` in tests (aliased in
 * vitest.config.ts). The real module exists only inside a build with the PWA
 * plugin; a test that renders App needs the hook to exist, not to register a
 * service worker.
 */
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}] as const,
    offlineReady: [false, () => {}] as const,
    updateServiceWorker: async () => {},
  };
}
