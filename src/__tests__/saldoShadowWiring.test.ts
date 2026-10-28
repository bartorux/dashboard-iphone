import { describe, it, expect } from 'vitest';
// `?raw` reads the literal source, as in exchangeMissingWiring.test.ts.
import generatorSrc from '../../scripts/summary.ts?raw';

/**
 * Stage 2 of the exchange estimate (28.10.2026): computed and measured in the
 * background for two to three weeks, NOTHING on screen. The owner decided the
 * estimate may only ever describe — and before it does even that, its numbers
 * go to him first. These pin the shadow: no app module imports it, and the
 * generator keeps it out of public/, the only folder a phone downloads.
 */
const appSources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/__tests__/**', '!../utils/saldo*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('szacunek salda w cieniu', () => {
  it('nie trafia do żadnego modułu aplikacji', () => {
    expect(Object.keys(appSources).length).toBeGreaterThan(50);
    const users = Object.entries(appSources)
      .filter(([, src]) => /from\s+['"][^'"]*\/saldo(Szacunek|Ocena)['"]/.test(src))
      .map(([path]) => path);
    expect(users).toEqual([]);
  });

  it('generator pisze tylko do data/, nie do public/', () => {
    expect(generatorSrc).toMatch(/const saldoLogDir = resolve\(root, 'data\/saldo-szacunki'\)/);
    expect(generatorSrc).toMatch(/const saldoOcenaTarget = resolve\(root, 'data\/saldo-ocena\.json'\)/);
    expect(generatorSrc).not.toMatch(/public\/saldo/);
  });

  it('liczy po obu archiwach, na tych samych odczytach co badanie, i nie w trybie --dry-run', () => {
    expect(generatorSrc).toMatch(
      /if \(!dryRun\) \{\s*const archiveRows = readArchiveRows\(now\);\s*await writeBadanie\(now, archiveRows\);\s*await writeSaldo\(now, archiveRows\);\s*\}/
    );
    expect(generatorSrc.indexOf('await writeSaldo(now')).toBeGreaterThan(generatorSrc.indexOf('archivePk5l(forecast, now)'));
  });

  it('nie zasila faktów dla tekstu AI', () => {
    const facts = generatorSrc.slice(generatorSrc.indexOf('const facts = buildFacts('));
    expect(facts.slice(0, facts.indexOf(');'))).not.toMatch(/estimate|saldo/i);
  });
});
