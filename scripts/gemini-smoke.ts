/**
 * Pins down the request shape against the live API, because the documentation
 * describes more than one and guessing would cost a round.
 *
 *   GEMINI_API_KEY=... npx tsx scripts/gemini-smoke.ts
 *
 * Reads the key from the environment and never writes it anywhere.
 */
import { fetchPSEData, fetchPSEHistory } from '../src/utils/api';
import { processData } from '../src/utils/dataTransform';
import { buildFacts, renderFacts } from '../src/utils/summaryFacts';

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('Brak GEMINI_API_KEY w srodowisku.');
  process.exit(1);
}

const MODEL = 'gemini-3.5-flash-lite';
const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const _UNUSED_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    body: { type: 'string' },
    outlook: { type: 'string' },
  },
  required: ['headline', 'body', 'outlook'],
};

/**
 * Written in correct Polish on purpose, diacritics and all. Runs where the
 * instruction was plain ASCII came back stripped of them — the model mirrors the
 * register of its prompt, and the prompt is the bulk of the request.
 */
const INSTRUCTION = `Na podstawie PONIŻSZYCH FAKTÓW napisz krótkie podsumowanie
po polsku o rezerwach mocy w krajowej sieci elektroenergetycznej.

JĘZYK — to najważniejsze:
- Odbiorcy pracują w energetyce. Pisz zawodowo i rzeczowo, ale bez żargonu.
- ZAKAZANE zwroty, bo nic nie wnoszą: „sytuacja bilansowa", „bilans systemowy",
  „zasoby DSR", „jednostki DSR", „ciągłość pracy", „profil generacji".
- ZAKAZANE kolokwializmy, na przykład „zrobi się ciasno", „na styk".
- Mów wprost: rezerwa mocy, wymagana rezerwa, margines, okres przywołania.
- Krótkie zdania. Pisz poprawną polszczyzną, z polskimi znakami.

ZASADY, bezwzględnie:
- NIE podawaj żadnych liczb. Żadnych megawatów, procentów, liczby godzin.
  Jedyne dozwolone cyfry to godziny w formacie HH:MM występujące w faktach.
- Nie wymyślaj faktów. Pisz wyłącznie o tym, co jest poniżej.
- Nie pisz o teście ani o testowym okresie przywołania — tych danych nie mamy.
- Nie przypisuj operatorowi zamiarów ani przewidywań. Nie wiemy, co planuje.
  Pisz o tym, czy są PODSTAWY do przywołania, nie o tym, co operator zrobi.
- Nie pisz w pierwszej osobie liczby mnogiej.
- Bez dramatyzowania i bez uspokajania na siłę. Bez zdań pustych w rodzaju
  „sytuacja będzie monitorowana".
- NIE POWTARZAJ zasad ogłaszania przywołania. Czytelnik je zna.

NAJWAŻNIEJSZE ROZRÓŻNIENIE, nie pomyl go:
- Margines DODATNI oznacza, że dostępna rezerwa POKRYWA wymaganą. Nawet bardzo
  cienki margines nadal ją pokrywa.
- Tylko margines UJEMNY oznacza, że rezerwa spadła poniżej wymaganej.
- Nigdy nie pisz, że rezerwa spadła poniżej wymaganej, jeśli fakty tego nie mówią.

Kontekst: okres przywołania to sytuacja, w której operator sieci wzywa odbiorców
do ograniczenia poboru.

FORMAT ODPOWIEDZI — dokładnie trzy linie, każda z etykietą na początku:
NAGŁÓWEK: jedno zdanie, najważniejsza rzecz.
TREŚĆ: dwa do trzech zdań o tym, co się dzieje i z czym można się zmierzyć.
DALEJ: jedno zdanie o kolejnych dniach.

Żadnego JSON-a, żadnych cudzysłowów wokół pól, żadnych sekwencji ucieczki.

FAKTY:
`;

const [forecast, history] = await Promise.all([
  fetchPSEData(),
  fetchPSEHistory(30),
]);
const facts = renderFacts(
  buildFacts(processData(forecast), processData(history), new Date()),
  30
);

async function attempt(label: string, generationConfig: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key! },
    body: JSON.stringify({
      contents: [{ parts: [{ text: INSTRUCTION + facts }] }],
      generationConfig,
    }),
  });

  const raw = await response.text();
  console.log(`\n=== ${label} -> HTTP ${response.status} ===`);
  if (!response.ok) {
    console.log(raw.slice(0, 600));
    return;
  }

  const parsed = JSON.parse(raw);
  const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '(brak)';
  console.log('tokeny:', JSON.stringify(parsed.usageMetadata));
  console.log(text);
}

// Two runs at the same settings: this text is regenerated hourly, so it has to
// read the same way each time, not merely read well once.
for (const run of [1, 2, 3]) {
  await attempt(`zwykly tekst, przebieg ${run}`, {
    temperature: 0.2,
    maxOutputTokens: 800,
    thinkingConfig: { thinkingLevel: 'minimal' },
  });
}
