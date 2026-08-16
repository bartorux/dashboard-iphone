/**
 * Runs the generator end to end with the model stubbed out.
 *
 * The only way to exercise `scripts/summary.ts` past the point where it calls
 * Gemini without holding a key — and the only check that would have caught what
 * went out on 16 August. A variable had been moved into a function while a line
 * further down still read it; unit tests never touch the script, the browser
 * typecheck never looked at `scripts/`, and a run with a bad key exits before
 * reaching the line. It broke solely on the runs where the answer was accepted,
 * which is to say on every good run.
 *
 *   ODPOWIEDZI='NAGŁÓWEK: ...\nTREŚĆ: ...\nDALEJ: ...' npx tsx scripts/probny-przebieg.mts
 *   ODPOWIEDZI='pierwsza|||druga' ...   # two answers: the first is refused, the second stands
 *
 * PSE is still called for real; only the Gemini endpoint is answered from here.
 * WRITES to public/summary.json and data/ exactly as the real run does, so back
 * those up first or restore them afterwards with `git checkout -- public data`.
 */
const prawdziwyFetch = globalThis.fetch;
const odpowiedzi = (process.env.ODPOWIEDZI ?? '').split('|||');
let wywolan = 0;

if (!process.env.ODPOWIEDZI) {
  console.error('Ustaw ODPOWIEDZI — treść, którą ma „odpowiedzieć" model.');
  process.exit(1);
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (!String(input).includes('generativelanguage')) {
    return prawdziwyFetch(input, init);
  }

  // The last answer repeats, so a single one can stand in for every attempt —
  // which is how the "both refused" case is exercised.
  const tekst = odpowiedzi[Math.min(wywolan, odpowiedzi.length - 1)];
  wywolan += 1;
  console.log(`[atrapa] wywołanie modelu nr ${wywolan}`);

  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: tekst }] } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}) as typeof fetch;

process.env.GEMINI_API_KEY ??= 'atrapa';

await import('./summary.ts');
