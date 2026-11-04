import { describe, it, expect } from 'vitest';
// `?raw` reads the literal source, as in newsWiring.test.ts.
import summaryWorkflow from '../../.github/workflows/summary.yml?raw';
import savesGuard from '../../.github/workflows/zapisy-podsumowania.yml?raw';
import freshnessGuard from '../../.github/workflows/analiza-zywa.yml?raw';

/**
 * What the owner gets e-mailed about. On 3-4.11.2026 four publications failed
 * on GitHub's side, each one an e-mail, and two of them then lit the saves guard
 * with a false "every one is a lost reading". Workflows have no render path and
 * no unit tests, so the links that keep an alarm true are pinned by reading them.
 */
describe('alarm o utraconych zapisach', () => {
  it('liczy zadanie summary, nie sam status przebiegu', () => {
    expect(savesGuard).toContain('select(.name == "summary" and .conclusion == "failure")');
    expect(savesGuard).not.toMatch(/nieudane=\$\(gh api[^\n]*total_count/);
  });

  it('zadanie w summary.yml nadal nazywa się tak, jak szuka go strażnik', () => {
    // Renamed, the select above would match nothing and the alarm would stay green for good.
    expect(summaryWorkflow).toMatch(/^ {2}summary:$/m);
    expect(summaryWorkflow).toMatch(/^ {2}deploy:$/m);
    expect(summaryWorkflow).not.toMatch(/^ {4}name:/m);
  });

  it('błąd odczytu listy kończy krok, zamiast zostawić pustą pętlę i zielony wynik', () => {
    expect(savesGuard).toContain('set -euo pipefail');
    expect(savesGuard).toMatch(/\n\s+padly=\$\(gh api[^\n]*status=failure/);
    expect(savesGuard).toMatch(/for id in \$padly; do/);
  });
});

describe('publikacja na Pages', () => {
  const deployJob = summaryWorkflow.slice(summaryWorkflow.indexOf('\n  deploy:'));

  it('nie wywraca przebiegu przy żadnym z dwóch podejść', () => {
    const attempts = deployJob.match(/uses: actions\/deploy-pages@v5\n\s+continue-on-error: true/g) ?? [];
    expect(attempts).toHaveLength(2);
    expect(deployJob.match(/uses: actions\/deploy-pages@v5/g)).toHaveLength(2);
  });

  it('czyta .outcome: przy continue-on-error .conclusion zawsze mówi success', () => {
    expect(deployJob).toContain("if: steps.deployment.outcome == 'failure'");
    expect(deployJob).toContain("if: steps.deployment.outcome == 'failure' && steps.ponowna.outcome == 'failure'");
    expect(deployJob).not.toMatch(/steps\.\w+\.conclusion/);
  });

  it('poprzednie kroki zadania nadal mogą paść głośno', () => {
    const before = deployJob.slice(0, deployJob.indexOf('- id: deployment'));
    expect(before).toContain('npm run build');
    expect(before).not.toMatch(/^\s+continue-on-error:/m);
  });

  it('trwałą awarię łapie strażnik świeżości, bo czyta opublikowany plik, nie repozytorium', () => {
    expect(freshnessGuard).toContain('https://bartorux.github.io/dashboard-iphone/summary.json');
    expect(freshnessGuard).toContain('PROG_GODZIN=15');
  });
});
