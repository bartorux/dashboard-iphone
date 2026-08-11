/**
 * Reads a day of the model's answers at once, which is the only way a weak one
 * shows up.
 *
 *   npx tsx scripts/teksty.ts            # the log, newest last
 *   npx tsx scripts/teksty.ts --pelne    # with the full text of each
 *   npx tsx scripts/teksty.ts --zasil    # seed the log from git history, once
 *
 * A single summary always reads as fine. Put twenty next to each other and the
 * pattern appears: today, prompts 20-25 named the verdict twice, 26 got it to
 * once, 27 put it back, and 28 onwards held — none of which was visible while
 * reading them one at a time, an hour apart.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMPTY_LOG,
  appendAttempt,
  parseLog,
  signalsFor,
  type Attempt,
} from '../src/utils/summaryLog';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'data/summary-log.json');

function read(): ReturnType<typeof parseLog> {
  try {
    return parseLog(JSON.parse(readFileSync(target, 'utf8')));
  } catch {
    return EMPTY_LOG;
  }
}

/**
 * Rebuild the log from the commits that published each summary.
 *
 * Every refresh is a commit, so the accepted texts were recoverable all along —
 * just not readable in one place. Refused ones are gone for good; from here on
 * the job records those as they happen.
 */
function seedFromGit(): void {
  const shas = execFileSync(
    'git',
    ['log', '--format=%H', '--reverse', '--', 'public/summary.json'],
    { cwd: root, encoding: 'utf8' }
  )
    .split('\n')
    .filter(Boolean);

  let log = EMPTY_LOG;
  let added = 0;

  for (const sha of shas) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(
        execFileSync('git', ['show', `${sha}:public/summary.json`], {
          cwd: root,
          encoding: 'utf8',
        })
      );
    } catch {
      continue;
    }

    if (typeof parsed.generatedAt !== 'string') continue;

    const version = /#v(\d+)$/.exec(String(parsed.assessment ?? ''));
    const attempt: Attempt = {
      at: parsed.generatedAt,
      prompt: version ? Number(version[1]) : 0,
      accepted: true,
      headline: String(parsed.headline ?? ''),
      body: String(parsed.body ?? ''),
      outlook: String(parsed.outlook ?? ''),
    };

    // The same summary can be committed twice — a rebase, a re-publish — and a
    // duplicate would read as the model repeating itself, which is the very
    // thing this is meant to detect.
    if (log.attempts.some((entry) => entry.at === attempt.at)) continue;

    log = appendAttempt(log, attempt);
    added += 1;
  }

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(log, null, 2)}\n`);
  console.log(`Zasilono log z historii: ${added} tekstow, zapisano ${log.attempts.length}.`);
}

if (process.argv.includes('--zasil')) {
  seedFromGit();
  process.exit(0);
}

const pelne = process.argv.includes('--pelne');
const log = read();

if (log.attempts.length === 0) {
  console.log('Log pusty. Zasil go z historii: npx tsx scripts/teksty.ts --zasil');
  process.exit(0);
}

console.log(`${log.attempts.length} odpowiedzi\n`);
console.log('czas   v   stan  przyw.  znakow  powtorzona fraza / powod odrzucenia');
console.log('-'.repeat(96));

for (const attempt of log.attempts) {
  const s = signalsFor(attempt);
  const uwaga = attempt.accepted
    ? s.powtorzenie
    : `ODRZUCONE: ${attempt.reason ?? '?'}`;

  console.log(
    [
      attempt.at.slice(11, 16),
      `v${attempt.prompt}`.padEnd(4),
      attempt.accepted ? 'ok  ' : 'NIE ',
      // Two is the repetition that kept coming back; flagged so the eye finds it.
      `${s.przywolania}${s.przywolania > 1 ? ' !' : '  '}`.padEnd(7),
      String(s.dlugosc).padStart(6),
      '  ' + uwaga,
    ].join(' ')
  );

  if (pelne) {
    console.log(`         ${attempt.headline}`);
    if (attempt.body) console.log(`         ${attempt.body}`);
    if (attempt.outlook) console.log(`         ${attempt.outlook}`);
    console.log();
  }
}
