import { describe, it, expect } from 'vitest';
import {
  INSTRUCTION,
  buildPrompt,
  hasSomethingToExplain,
  parseSummary,
  swap,
  validateSummary,
} from '../summaryText';
import { allowedHoursFor, assessmentKey, buildFacts } from '../summaryFacts';
import type { CompassHour, CompassLevel } from '../compass';
import { dayMonth, spokenDay } from '../dateHelpers';
import { makePoint } from '../../test/factories';

const pad = (value: number) => String(value).padStart(2, '0');

function hourOn(
  businessDate: string,
  startHour: number,
  overrides: Partial<Parameters<typeof makePoint>[0]> = {}
) {
  return makePoint({
    businessDate,
    hourLabel: `${pad(startHour)}:00`,
    endLabel: `${pad((startHour + 1) % 24)}:00`,
    time: new Date(`${businessDate}T${pad((startHour + 1) % 24)}:00:00Z`),
    ...overrides,
  });
}

const HOURS = new Set(['19:00', '20:00']);

// The body names its day. Under the rule added after a published run said
// "O 20:00 wiatr spada poniżej normy" on a Tuesday about Thursday, a summary
// without one is not a valid summary.
const good = {
  headline: 'Nie ma podstaw do ogłoszenia okresu przywołania.',
  body: 'Rezerwa pokrywa wymaganą wartość. Najciaśniej będzie w czwartek o 20:00.',
  outlook: 'W kolejnych dniach margines pozostaje bezpieczny.',
};

describe('buildPrompt', () => {
  /*
   * Two words we spent a round rejecting in the output turned out to have been
   * put in front of the model by us. „horyzont" existed nowhere in this codebase
   * except one rotating variant, and „wezwanie" nowhere except inside a sentence
   * held up as an example of bad writing — the model lifted the noun out of it.
   * Neither survived long enough to be traced by reading the summaries alone.
   *
   * Nothing else guards the wording of the prompt, which is how both lasted
   * seventeen revisions of it.
   */
  it('never shows the model a word we go on to reject in its reply', () => {
    // Every hour of the day, so all five rotating variants are covered.
    const prompt = Array.from({ length: 24 }, (_, hour) =>
      buildPrompt(
        buildFacts(
          [hourOn('2026-08-10', 19, { reserve: 800, required: 2000 })],
          [],
          new Date('2026-08-09T00:00:00Z')
        ),
        30,
        new Date(`2026-08-09T${pad(hour)}:00:00Z`)
      )
    ).join('\n');

    expect(prompt).not.toMatch(/horyzon/i);
    // „wzywa" in the opening definition is the verb and stays; this is the noun.
    expect(prompt).not.toMatch(/wezwan/i);
  });

  it('shows no finished sentence the model could simply copy', () => {
    /*
     * Measured over seventy-two published texts: fifty-nine reproduced an
     * eight-word run from this instruction, and the three most-copied strings
     * were the tails of its own worked examples — "…więc operator ma prawo nie
     * ogłaszać przywołania" twenty-three times among them. The examples were
     * written to demonstrate good style; the model read them as text to reuse,
     * and the card came to sound like a filled-in form.
     *
     * Worse, the second example had been added precisely because one example
     * produced a mechanical rhythm. Two templates is still templates.
     *
     * The examples are skeletons now. This guards against a finished sentence
     * creeping back in, which is the only way the copying returns.
     */
    const zdania = [
      'Nadwyżka wciąż przekracza próg 1100 MW, więc operator ma prawo',
      'i to ona daje operatorowi prawo nie ogłaszać',
      'W żadnym z kolejnych dni nic nie zapowiada przywołania',
      'W piątek o 20:00 operator ma prawo nie ogłaszać',
    ];

    for (const zdanie of zdania) {
      expect(INSTRUCTION.split('\n').join(' ')).not.toContain(zdanie);
    }
  });
});

describe('prompt bez wiersza TREŚĆ', () => {
  const spokojnie = buildFacts(
    [hourOn('2026-08-10', 19, { reserve: 6000, required: 2000 })],
    [],
    new Date('2026-08-09T00:00:00Z')
  );
  // Narrow but positive: one fact, which the headline takes. Counting it as
  // something to explain left TREŚĆ with the verdict again — published as the
  // same hour in the headline and the body, and the verdict in both body and
  // outlook.
  const waski = buildFacts(
    [hourOn('2026-08-10', 19, { reserve: 2100, required: 2000 })],
    [],
    new Date('2026-08-09T00:00:00Z')
  );
  const cos = buildFacts(
    [hourOn('2026-08-10', 19, { reserve: 800, required: 2000 })],
    [],
    new Date('2026-08-09T00:00:00Z')
  );

  it('drops the middle line when no day has anything to explain', () => {
    // Three instructions tried to stop the model repeating the verdict across
    // TREŚĆ and DALEJ; each moved it rather than removing it. A slot that exists
    // gets filled, so on a quiet period there is no slot.
    const prompt = buildPrompt(spokojnie, 30, new Date('2026-08-09T10:00:00Z'));

    expect(prompt).toContain('Wiersza TREŚĆ tym razem NIE');
    expect(prompt).toContain('Dokładnie DWA wiersze');
    expect(prompt).not.toContain('TREŚĆ: DWA zdania');
    // The three-line preamble has to go with it, or the prompt contradicts
    // itself about how many lines it wants.
    expect(prompt).not.toContain('Dokładnie trzy wiersze');
  });

  it('drops it for a narrow margin too, which is one fact and no more', () => {
    expect(waski[0].nearThreshold).toBeGreaterThan(0);
    expect(waski[0].risk).toBe('none');

    const prompt = buildPrompt(waski, 30, new Date('2026-08-09T10:00:00Z'));
    expect(prompt).toContain('Dokładnie DWA wiersze');
  });

  it('keeps it on a calm week that has a cause to give', () => {
    // This is the case the whole cause layer exists for. Nothing is happening —
    // no grounds, no narrow margin — and the only thing worth a sentence is why
    // the tightest hour is the tightest. Most weeks look like this, so if the
    // middle line stayed shut here the text would go on being as dry as the
    // complaint that started this.
    // Working days only: 1 and 2 August fall at the weekend, and the bands are
    // per day type now, so a weekend-leaning history leaves the working day
    // under the minimum sample count and with no cause at all.
    const history = Array.from({ length: 4 }, (_, day) =>
      hourOn(`2026-08-0${day + 3}`, 19, { reserve: 6000, required: 2000 })
    );
    const bezwietrznie = buildFacts(
      [hourOn('2026-08-10', 19, { reserve: 6000, required: 2000, wind: 400 })],
      history,
      new Date('2026-08-09T00:00:00Z')
    );

    expect(bezwietrznie[0].risk).toBe('none');
    expect(bezwietrznie[0].nearThreshold).toBe(0);
    expect(bezwietrznie[0].drivers).not.toBeNull();

    const prompt = buildPrompt(bezwietrznie, 30, new Date('2026-08-09T10:00:00Z'));

    // Answer first: the headline states plainly that nothing is coming, and the
    // cause follows as detail. The arrangement this replaced forbade the
    // headline from saying it, so it reached for "rezerwa spada najniżej" and
    // the two lines beneath spent their words taking that back.
    expect(prompt).toContain('w tych dniach nic nie zapowiada przywołania');
    expect(prompt).toContain('TREŚĆ: JEDNO zdanie o godzinie');
    // The day must be copied whole, not shortened to a weekday name — that
    // shortening is what turned 17 August into a Monday the reader took for
    // today.
    expect(prompt).toContain('nazwij DOKŁADNIE tak,');
    expect(prompt).toContain('nie skracaj „poniedziałek 17 sierpnia"');
    // Not the general brief, which is what let the verdict into the body.
    expect(prompt).not.toContain('TREŚĆ: DWA zdania. Każde ma nieść');
  });

  it('stops describing DALEJ once it has stopped asking for it', () => {
    // Left in, the instruction went on explaining at length how to write a line
    // it had just said not to write — and the examples there carry the very
    // phrase the headline is now meant to own.
    // Working days only: 1 and 2 August fall at the weekend, and the bands are
    // per day type now, so a weekend-leaning history leaves the working day
    // under the minimum sample count and with no cause at all.
    const history = Array.from({ length: 4 }, (_, day) =>
      hourOn(`2026-08-0${day + 3}`, 19, { reserve: 6000, required: 2000 })
    );
    const bezwietrznie = buildFacts(
      [hourOn('2026-08-10', 19, { reserve: 6000, required: 2000, wind: 400 })],
      history,
      new Date('2026-08-09T00:00:00Z')
    );

    const prompt = buildPrompt(bezwietrznie, 30, new Date('2026-08-09T10:00:00Z'));

    expect(prompt).toContain('Wiersza DALEJ tym razem NIE MA');
    expect(prompt).not.toContain('WZORZEC DLA DALEJ');
    expect(prompt).not.toContain('DALEJ: jedno zdanie o kolejnych dniach');
  });

  it('gives the middle line one job per sentence, movement first', () => {
    /*
     * Published on v36, with the movement available in the facts and ignored:
     * the model wrote the cause and the legal state and said nothing about the
     * forecast sliding 1863 MW. Not disobedience — the brief named four things
     * for two sentences (cause, why the operator may refrain, whether the
     * announcement may still come, and movement) and left the choice open, so it
     * took the two that were named inside the TREŚĆ line itself.
     *
     * Movement now owns the first sentence outright, and the legal state is
     * struck from the brief because the headline already carries it.
     */
    const zPodstawami = buildFacts(
      [hourOn('2026-08-10', 19, { reserve: 800, required: 2000 })],
      [],
      new Date('2026-08-09T00:00:00Z')
    );

    const prompt = buildPrompt(zPodstawami, 30, new Date('2026-08-09T10:00:00Z'));

    expect(prompt).toContain('PIERWSZE — to, co fakty podają');
    expect(prompt).toContain('NIE powtarzaj tu stanu prawnego');
    // The open-ended brief that let the model choose is gone.
    expect(prompt).not.toContain('Poza tym: dlaczego operator ma prawo');
    /*
     * And the brief now describes what the facts actually hand over. It used to
     * say "movement, or failing that the cause" while the facts printed both —
     * so the model welded them: "prognoza pogarsza się Z POWODU fotowoltaiki
     * poniżej normy", a causal claim the data cannot support. The facts give one
     * or the other now, and the instruction says so. Three alternatives since
     * the log gained a reading for a day that has not settled at all — still
     * exactly one of them per run.
     */
    expect(prompt).toContain('JEDNO z trzech, nigdy dwa');
    expect(prompt).toContain('JESZCZE SIĘ USTALA');
  });

  it('throws rather than quietly leaving the instruction unchanged', () => {
    // The failure this exists for: a replacement that matches nothing used to
    // report success, and the run would publish the default shape while looking
    // like it had applied the variant. A throw fails the job instead, which
    // leaves the previous summary in place and raises a warning.
    expect(() => swap('abc', 'nie ma tego', 'x')).toThrow(/Fragment instrukcji/);
    expect(swap('abc', 'b', 'B')).toBe('aBc');
  });

  it('fails loudly if the instruction is reworded without the variants', () => {
    // A replacement that matches nothing used to report success and publish the
    // wrong shape. This is the guard that turns that into a failed run, which
    // leaves the previous summary in place instead.
    expect(INSTRUCTION).toContain('DALEJ: jedno zdanie o kolejnych dniach');
    expect(INSTRUCTION).toContain('WZORZEC DLA DALEJ');
  });

  it('hands the verdict phrase over once, not once per day', () => {
    // Counted on the published failure: the prompt showed the model the calm
    // state seven times and the cause once, and the model
    // reached for what it had seen seven times. The per-day state line said the
    // same thing five times over while keyPoint already covered the window.
    const tydzien = buildFacts(
      [
        ...Array.from({ length: 5 }, (_, day) =>
          hourOn(`2026-08-1${day}`, 19, { reserve: 6000, required: 2000 })
        ),
      ],
      [],
      new Date('2026-08-09T00:00:00Z')
    );

    // Counted inside the facts only. The instruction says the phrase twice more
    // — once defining the term, once justifying the two-line shape — and both
    // belong there; what mattered was the five identical lines underneath.
    const fakty = buildPrompt(tydzien, 30, new Date('2026-08-09T10:00:00Z'))
      .split('FAKTY:')
      .pop() as string;
    const wystapienia =
      fakty.match(/nic nie zapowiada przywołania/g)?.length ?? 0;

    // The day is named the way it is spoken, not by its ISO date — that used to
    // head every block and the model copied it straight into the answer.
    expect(fakty).toContain(spokenDay('2026-08-14', new Date('2026-08-09T10:00:00Z')));
    expect(fakty).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(wystapienia).toBe(1);
  });

  it('keeps the per-day verdict when the days differ', () => {
    // The collapse is only honest while every day says the same thing.
    const mieszany = buildFacts(
      [
        hourOn('2026-08-10', 19, { reserve: 800, required: 2000 }),
        hourOn('2026-08-11', 19, { reserve: 6000, required: 2000 }),
      ],
      [],
      new Date('2026-08-09T00:00:00Z')
    );

    expect(buildPrompt(mieszany, 30, new Date('2026-08-09T10:00:00Z'))).toContain(
      '  stan:'
    );
  });

  it('keeps it when a day carries grounds', () => {
    const prompt = buildPrompt(cos, 30, new Date('2026-08-09T10:00:00Z'));

    expect(prompt).toContain('TREŚĆ: DWA zdania');
    expect(prompt).toContain('Dokładnie trzy wiersze');
    expect(prompt).not.toContain('Dokładnie DWA wiersze');
  });

  it('accepts a reply that has no TREŚĆ, and still refuses one missing DALEJ', () => {
    const bezTresci = parseSummary(
      'NAGŁÓWEK: W środę margines jest najwęższy.\nDALEJ: W żadnym z dni nie ma podstaw do przywołania.'
    );
    expect(bezTresci?.body).toBe('');
    expect(bezTresci?.outlook).toContain('nie ma podstaw');

    expect(parseSummary('NAGŁÓWEK: Cokolwiek.')).toBeNull();
  });

  it('does not call an absent TREŚĆ an empty field', () => {
    const ok = validateSummary(
      {
        headline: 'W środę o 19:00 margines jest najwęższy.',
        body: '',
        outlook: 'W żadnym z kolejnych dni nie ma podstaw do przywołania.',
      },
      new Set(['19:00'])
    );
    expect(ok).toEqual({ ok: true });
  });
});

describe('parseSummary', () => {
  it('accepts a label the model mistyped, because the label is not content', () => {
    /*
     * Seven of thirteen refusals over five days — the largest cause by far —
     * were answers where the model wrote "TREŚCI:" or "TREŚC:" instead of
     * "TREŚĆ:". The text underneath was good every time, and being strict about
     * a word no reader ever sees threw all seven away. The trailing ć is the one
     * character in these labels a model writing Polish reaches past.
     */
    for (const etykieta of ['TREŚĆ', 'TREŚCI', 'TREŚC', 'TRESC', 'TREŚ']) {
      const parsed = parseSummary(
        `NAGŁÓWEK: W tych dniach nic nie zapowiada przywołania.\n${etykieta}: Dziś o 20:00 margines jest najwęższy.`
      );
      expect(parsed?.body).toBe('Dziś o 20:00 margines jest najwęższy.');
    }

    // The headline label too, which is exposed to the same slip.
    expect(parseSummary('NAGLOWEK: Nic nie zapowiada.\nDALEJ: Spokojnie.')?.headline).toBe(
      'Nic nie zapowiada.'
    );
  });

  it('still needs a headline and something under it', () => {
    // Loosening the labels must not loosen the shape: an answer that is only a
    // headline is thinner than the card promises.
    expect(parseSummary('NAGŁÓWEK: Nic nie zapowiada przywołania.')).toBeNull();
    expect(parseSummary('TREŚĆ: Coś tam.')).toBeNull();
  });

  it('reads the three labelled lines', () => {
    const parsed = parseSummary(
      'NAGŁÓWEK: Pierwsze zdanie.\nTREŚĆ: Drugie zdanie.\nDALEJ: Trzecie zdanie.'
    );
    expect(parsed).toEqual({
      headline: 'Pierwsze zdanie.',
      body: 'Drugie zdanie.',
      outlook: 'Trzecie zdanie.',
    });
  });

  it('refuses a reply missing a field rather than half-filling one', () => {
    expect(parseSummary('NAGŁÓWEK: Samotne zdanie.')).toBeNull();
    expect(parseSummary('zupelnie co innego')).toBeNull();
  });

  it.each([
    ['without DALEJ', 'NAGŁÓWEK: Pierwsze zdanie.\nTREŚĆ: Drugie zdanie.'],
    ['without TREŚĆ', 'NAGŁÓWEK: Pierwsze zdanie.\nDALEJ: Trzecie zdanie.'],
  ])('reads a two-line reply %s', (_label, text) => {
    // Both shapes are asked for by design — which line is dropped depends on
    // whether the quiet period has a cause to explain. Refusing either here
    // would throw away a perfectly good answer and freeze the card.
    expect(parseSummary(text)).not.toBeNull();
  });
});

describe('validateSummary', () => {
  it('refuses the eight-hour window said backwards', () => {
    /*
     * Elapsed time is what CLOSES this window, so "ogłoszenie może jeszcze
     * nadejść, ponieważ upłynęło wystarczająco dużo czasu" says the opposite of
     * the fact it came from. Eleven of the twenty-four texts carrying this
     * sentence were inverted or emptied of meaning.
     */
    const sprawdz = (outlook: string) =>
      validateSummary(
        { headline: 'Jutro o 19:00 margines jest wąski.', body: '', outlook },
        new Set(['19:00'])
      );

    expect(sprawdz('Ogłoszenie może jeszcze nadejść, ponieważ upłynęło wystarczająco dużo czasu.')).toEqual({
      ok: false,
      reason: 'okno ośmiu godzin opisane odwrotnie',
    });
    expect(sprawdz('Ogłoszenie może jeszcze nadejść, bo minęło mniej czasu niż wymagane wyprzedzenie.').ok).toBe(false);

    // Said forwards, it stays — and so does elapsed time in a sentence that is
    // not about the window at all.
    expect(sprawdz('Ogłoszenie może jeszcze nadejść, bo do tych godzin zostało ponad osiem godzin.')).toEqual({ ok: true });
    expect(sprawdz('Od rana minęło sporo czasu, a margines wciąż jest wąski.')).toEqual({ ok: true });
  });

  it('refuses a weekday glued to the wrong date', () => {
    /*
     * Six of 72 logged answers named one: "w środę 20 sierpnia" while the facts
     * said czwartek, and every earlier rule waved it through — the date fragment
     * is allowed, a day name is present, and nothing compared the two. It is a
     * mistake about WHEN, which is the only thing this card is opened for.
     */
    const dni = ['środa 19 sierpnia', 'czwartek 20 sierpnia', 'piątek 21 sierpnia'];
    const godziny = new Set(['19:00', '20:00']);
    const sprawdz = (outlook: string) =>
      validateSummary({ headline: 'Jutro o 19:00 margines jest wąski.', body: '', outlook }, godziny, dni);

    expect(sprawdz('W środę 20 sierpnia margines jest wąski.')).toEqual({
      ok: false,
      reason: 'dzień tygodnia nie zgadza się z datą',
    });
    // Beginning with an ASCII letter, which is the only half the first cut caught.
    expect(sprawdz('We wtorek 20 sierpnia margines jest wąski.').ok).toBe(false);

    // Correct pairs stay, inflection and all. "Środa" and "środę" differ at the
    // fifth character, and comparing five characters called every correct
    // Wednesday a mismatch.
    expect(sprawdz('We środę 19 sierpnia margines jest wąski.')).toEqual({ ok: true });
    expect(sprawdz('W piątek 21 sierpnia margines jest wąski.')).toEqual({ ok: true });

    // A date we never handed over gets no opinion: this rule compares against our
    // own day names, and about a day outside them it knows nothing.
    const obca = sprawdz('W środę 30 sierpnia margines jest wąski.');
    expect(obca.ok ? undefined : obca.reason).not.toBe(
      'dzień tygodnia nie zgadza się z datą'
    );
  });

  it('refuses one span stretched over several days, but not a range per day', () => {
    // Published on 16 August with the three days running 20:00-22:00,
    // 19:00-22:00 and 19:00-21:00. The envelope is true of the set and false of
    // every member but one — on Tuesday nothing happens at 19:00.
    const dni = [
      'poniedziałek 17 sierpnia',
      'wtorek 18 sierpnia',
      'środa 19 sierpnia',
      'czwartek 20 sierpnia',
      'piątek 21 sierpnia',
    ];
    const godziny = new Set(['18:00', '19:00', '20:00', '21:00', '22:00']);
    expect(
      validateSummary(
        {
          headline: 'We wtorek 18 sierpnia o 20:00 margines jest najwęższy.',
          body: '',
          outlook:
            'We wtorek 18 sierpnia, w czwartek 20 sierpnia i w piątek 21 sierpnia rezerwa spada poniżej wymaganego poziomu między 19:00 a 22:00.',
        },
        godziny,
        dni
      )
    ).toEqual({ ok: false, reason: 'jeden zakres godzin rozciągnięty na kilka dni' });

    // The same shape written the other way round. "od 19:00 do 21:00" is a range
    // as much as "między 19:00 a 21:00", and the first cut of this rule knew only
    // the second — which is how one correct text was refused for a form the
    // pattern could not see.
    expect(
      validateSummary(
        {
          headline: 'We wtorek 18 sierpnia o 20:00 margines jest najwęższy.',
          body: '',
          outlook: 'We wtorek 18 sierpnia i w czwartek 20 sierpnia od 19:00 do 21:00 operator ma wybór.',
        },
        godziny,
        dni
      )
    ).toEqual({ ok: false, reason: 'jeden zakres godzin rozciągnięty na kilka dni' });

    // The first cut counted clock times across the whole sentence and so let
    // this one through: the span really is shared by two days, and the third
    // day's hour further along says nothing about that.
    expect(
      validateSummary(
        {
          headline: 'We wtorek 18 sierpnia o 20:00 margines jest najwęższy.',
          body: '',
          outlook:
            'We wtorek 18 sierpnia i w czwartek 20 sierpnia między 19:00 a 21:00 operator ma wybór, a w piątek 21 sierpnia o 22:00 margines jest wąski.',
        },
        godziny,
        dni
      )
    ).toEqual({ ok: false, reason: 'jeden zakres godzin rozciągnięty na kilka dni' });

    // A range for each day is precise, useful, and stays.
    expect(
      validateSummary(
        {
          headline: 'We wtorek 18 sierpnia o 20:00 margines jest najwęższy.',
          body: '',
          outlook:
            'We wtorek 18 sierpnia między 20:00 a 22:00 oraz w czwartek 20 sierpnia między 19:00 a 22:00 rezerwa nie pokrywa wymaganego poziomu.',
        },
        godziny,
        dni
      )
    ).toEqual({ ok: true });

    // And naming several days with no hours at all — the way out the instruction
    // now permits — is untouched.
    expect(
      validateSummary(
        {
          headline: 'We wtorek 18 sierpnia o 20:00 margines jest najwęższy.',
          body: '',
          outlook:
            'We wtorek 18 sierpnia, w czwartek 20 sierpnia i w piątek 21 sierpnia rezerwa nie pokrywa wymaganego poziomu.',
        },
        godziny,
        dni
      )
    ).toEqual({ ok: true });

    // Every shape below was refused by the first cut of this rule over one day
    // of runs — eight refusals, five of them saying nothing false, three runs
    // lost outright. They are the reason the rule now aims at one shape only.
    const przechodzi = [
      // "od X do Y" is a range too; the first pattern only knew "między X a Y".
      'W czwartek 20 sierpnia między 19:00 a 21:00 oraz w piątek 21 sierpnia od 20:00 do 21:00 operator ma wybór.',
      // The hour belongs to Friday alone; the days after it carry no claim and
      // need no hour of their own.
      'W piątek 21 sierpnia między 20:00 a 21:00 operator ma wybór, natomiast w poniedziałek 17 sierpnia, we wtorek 18 sierpnia i w środę 19 sierpnia nic nie zapowiada przywołania.',
      // Three days, three times, told apart by "odpowiednio".
      'W poniedziałek 17 sierpnia, we wtorek 18 sierpnia i w piątek 21 sierpnia operator może ogłosić przywołanie odpowiednio o 18:00, 20:00 oraz między 19:00 a 22:00.',
      // A day named without an hour is an omission, never a false claim.
      'W czwartek 20 sierpnia między 19:00 a 21:00 oraz w piątek 21 sierpnia operator ma wybór.',
    ];
    // Told apart by the times themselves: nothing on the clock may stand between
    // the day list and the range for the sentence to read as one shared span.
    przechodzi.push(
      'W poniedziałek 17 sierpnia i we wtorek 18 sierpnia odpowiednio o 18:00 oraz między 19:00 a 22:00 operator ma wybór.'
    );
    for (const outlook of przechodzi) {
      expect(
        validateSummary(
          { headline: 'We wtorek 18 sierpnia o 20:00 margines jest najwęższy.', body: '', outlook },
          godziny,
          dni
        )
      ).toEqual({ ok: true });
    }
  });

  it('lets a multi-day DALEJ drop the hours instead of blurring them', () => {
    // Measured across 72 attempts: with one day named in DALEJ the vague time
    // never appeared (0/37), with two it appeared twice (2/27), with three it
    // appeared in half (4/8). The cause is structural — three days, each with
    // its own ranges, in one sentence — so removing the phrase from the prompt
    // was necessary and not sufficient. The way out has to be permitted, not
    // only the shortcut forbidden.
    const jedna = INSTRUCTION.split('\n').join(' ');
    // Rewritten after the rule contradicted the best text it ever produced: the
    // published DALEJ gave each of two days its own range, which is precise and
    // true, while the rule told the model not to. Forbidding the good shape is
    // what pushed it toward one span for several days — the shape that lies.
    expect(jedna).toMatch(/daj KAŻDEMU jego własne godziny/);
    expect(jedna).toMatch(/nigdy jednego zakresu na kilka dni/);
  });

  it('never shows the model the vague times it goes on to refuse', () => {
    // Three runs refused for "w godzinach wieczornych" — a phrase the prompt was
    // handing over three times, every one of them inside a prohibition. Naming a
    // phrase to forbid it is how it spreads; this is the fourth time on this
    // card, so the material goes and the rule stays.
    const jedna = INSTRUCTION.split('\n').join(' ');
    expect(jedna).not.toMatch(/w godzinach (wieczorn|porann|popo|nocn)/i);
    expect(jedna).not.toMatch(/w wyznaczonym przedziale|w (wyznaczonych|określonych) godzinach/i);

    // And the refusal still stands, including the form that used to slip past.
    for (const outlook of [
      'We wtorek margines spada w godzinach wieczornych.',
      'We wtorek przywołanie wchodzi w grę w wyznaczonych godzinach.',
    ]) {
      expect(
        validateSummary({ headline: 'Jutro o 19:00 margines jest wąski.', body: '', outlook }, new Set(['19:00']))
      ).toEqual({ ok: false, reason: 'mgliste określenie pory zamiast godziny' });
    }
  });

  it('accepts the date of a day we happen to call by another name', () => {
    // Measured on the night of 17 August: seven consecutive runs refused, and the
    // card stood unchanged for six hours. Nothing had changed in the prompt — at
    // midnight Monday's spoken name turned from "poniedziałek 17 sierpnia" into
    // "jutro", so the date stopped being an allowed fragment while the ISO date
    // at the head of the day block went on handing it over.
    const dni = ['dziś', 'jutro', 'wtorek 18 sierpnia', dayMonth('2026-08-17')];
    expect(
      validateSummary(
        {
          headline: 'W poniedziałek 17 sierpnia nadwyżka spadła poniżej 1100 MW o 19:00.',
          body: '',
          outlook: 'We wtorek 18 sierpnia nic nie zapowiada przywołania.',
        },
        new Set(['19:00']),
        dni
      )
    ).toEqual({ ok: true });

    // And a figure that is genuinely invented still goes.
    expect(
      validateSummary(
        { headline: 'Jutro o 19:00 rezerwa wyniesie 2500 MW.', body: '', outlook: '' },
        new Set(['19:00']),
        dni
      ).ok
    ).toBe(false);
  });

  it('refuses a magnitude the facts never state', () => {
    // The drivers layer says only that a factor fell outside its own 10-90 band,
    // and the movement layer only that a day is sliding. Neither says by how
    // much, so an adverb of degree is the model's own invention — measured in 12
    // of 63 accepted texts, every one of them a claim nothing supports.
    for (const outlook of [
      'W środę zapotrzebowanie wyraźnie przewyższa normę.',
      'W środę produkcja spada znacznie poniżej normy.',
      'Prognoza tej doby wyraźnie się pogarsza.',
    ]) {
      expect(
        validateSummary({ headline: 'W środę o 19:00 margines jest wąski.', body: '', outlook }, new Set(['19:00']))
      ).toEqual({ ok: false, reason: 'stopniuje to, czego fakty nie stopniują' });
    }
  });

  it('leaves the adverb alone when it grades something the facts do measure', () => {
    // The refusal this test exists to prevent: "rezerwa mocno spadnie przez
    // ubytki i PV poniżej normy" was binned twice in one morning by a rule that
    // allowed 40 characters of anything between the adverb and the word "norma".
    // Here the adverb grades the reserve, whose megawatts the facts state — only
    // the trailing "normy" pulled it in.
    expect(
      validateSummary(
        {
          headline: 'W środę o 19:00 margines jest wąski.',
          body: '',
          outlook: 'O 19:00 rezerwa mocno spadnie przez ubytki i PV poniżej normy.',
        },
        new Set(['19:00'])
      )
    ).toEqual({ ok: true });
  });

  it('leaves alone a magnitude the numbers do carry', () => {
    // The thirty-day band is a range of actual megawatts, so how far outside it a
    // day sits is a fact, not a grade. Refusing this too would have binned a text
    // for saying something true.
    expect(
      validateSummary(
        {
          headline: 'W środę o 19:00 margines jest wąski.',
          body: '',
          outlook: 'Rezerwa znacznie przewyższa typowy zakres z ostatnich dni.',
        },
        new Set(['19:00'])
      )
    ).toEqual({ ok: true });
  });

  it('accepts prose whose only digits are hours we computed', () => {
    expect(validateSummary(good, HOURS)).toEqual({ ok: true });
  });

  it.each([
    ['an empty body', { ...good, body: '' }],
    ['an empty outlook', { ...good, outlook: '' }],
  ])('accepts %s, since each shape drops one', (_label, summary) => {
    expect(validateSummary(summary, HOURS)).toEqual({ ok: true });
  });

  describe('data w nazwie dnia', () => {
    const zData = {
      ...good,
      body: 'Najciaśniej wypada poniedziałek 17 sierpnia o 20:00.',
    };

    it('refuses it when the facts never handed that name over', () => {
      // The ban on digits is what keeps every figure on this screen ours. It
      // only relaxes for names we supplied.
      expect(validateSummary(zData, HOURS)).toMatchObject({
        ok: false,
        reason: 'tekst zawiera liczbę spoza godzin',
      });
    });

    it('accepts it once the facts did', () => {
      /*
       * The deadlock this fixes. The window reaches over a weekend, so a day
       * beyond this week is named with its date and the instruction demands it
       * be copied whole — while the validator refused every answer for carrying
       * a digit. One published run, one warning, and the card frozen: exactly
       * what the 1100 MW exception was written to end, repeated.
       */
      expect(
        validateSummary(zData, HOURS, ['poniedziałek 17 sierpnia'])
      ).toEqual({ ok: true });
    });

    it.each([
      ['na początku zdania', 'Poniedziałek 17 sierpnia przynosi wąski margines o 20:00.'],
      ['w odmianie', 'Poniedziałku 17 sierpnia dotyczy ta uwaga o 20:00.'],
      // The month capitalised is not Polish, but it costs nothing to survive it
      // — and without this the case-insensitive flag would be untested code.
      ['z miesiącem wielką literą', 'W poniedziałek 17 Sierpnia jest wąsko o 20:00.'],
    ])('accepts the day name %s', (_label, body) => {
      /*
       * Three runs in fourteen were binned this way. Stripping the whole name
       * matched "w poniedziałek 17 sierpnia" and missed both the capitalised
       * form at the head of a sentence and the genitive — ordinary Polish, and
       * refused for the digit we ourselves told the model to write. Each refusal
       * leaves the card an hour stale.
       */
      expect(
        validateSummary({ ...good, body }, new Set(['20:00']), [
          'poniedziałek 17 sierpnia',
        ])
      ).toEqual({ ok: true });
    });

    it('clears the long name before the short one that is its prefix', () => {
      // Strip "poniedziałek" first and " 17 sierpnia" is left stranded, so a
      // correct answer would be refused for the digit we ourselves supplied.
      expect(
        validateSummary(zData, HOURS, ['poniedziałek', 'poniedziałek 17 sierpnia'])
      ).toEqual({ ok: true });
    });

    it('still refuses a figure the model made up', () => {
      const zmyslone = {
        ...good,
        body: 'W poniedziałek 17 sierpnia o 20:00 zabraknie 250 jednostek.',
      };

      expect(
        validateSummary(zmyslone, HOURS, ['poniedziałek 17 sierpnia'])
      ).toMatchObject({ ok: false });
    });
  });

  describe('godzina bez nazwy dnia', () => {
    const godzinaWTresci = {
      ...good,
      headline: 'W poniedziałek 17 sierpnia margines układa się typowo.',
      body: 'Między 19:00 a 20:00 rezerwa nie pokryje wymaganego poziomu.',
    };

    it('accepts an hour whose day is named in the headline above it', () => {
      /*
       * Checked against the body alone, this refused two of nineteen runs — both
       * of them correct writing, with the day standing directly above the hour.
       * Every refusal leaves the card an hour stale, so a rule that fires on good
       * text is worse than no rule at all.
       */
      expect(
        validateSummary(godzinaWTresci, new Set(['19:00', '20:00']), [
          'poniedziałek 17 sierpnia',
        ])
      ).toEqual({ ok: true });
    });

    it('still refuses an hour with no day anywhere', () => {
      expect(
        validateSummary(
          { ...godzinaWTresci, headline: 'Margines układa się typowo.' },
          new Set(['19:00', '20:00'])
        )
      ).toMatchObject({ ok: false, reason: 'godzina bez nazwy dnia' });
    });
  });

  it('refuses „dodatkowy" where „dodatni" was meant', () => {
    // One text in seventy-two: "margines jest wąski, ale dodatkowy". The word
    // means "extra", and positive-versus-negative margin is the distinction the
    // entire card rests on. The prompt says "dodatni" six times and never
    // supplies this one — the first fault here that is the model's own.
    expect(
      validateSummary(
        { ...good, outlook: 'We wtorek margines jest wąski, ale dodatkowy.' },
        HOURS
      )
    ).toMatchObject({ ok: false, reason: '„dodatkowy" zamiast „dodatni"' });
  });

  it('leaves „dodatni" alone', () => {
    expect(
      validateSummary(
        { ...good, outlook: 'We wtorek margines jest wąski, ale dodatni.' },
        HOURS
      )
    ).toEqual({ ok: true });
  });

  it('does not bin an ordinary sentence for one character', () => {
    /*
     * A published answer was refused at 201 characters against a limit of 200 —
     * one over, and the card kept the previous text for an hour. Measured across
     * seventy texts, DALEJ reaches 242 while body is capped at 500 against a max
     * of 311: the limit was binding on ordinary sentences rather than on
     * runaways, which is not what it is for.
     */
    const dlugi =
      'We wtorek 18 sierpnia w godzinach 19:00-21:00 operator może ogłosić ' +
      'przywołanie, ale przepis pozwala je pominąć, dopóki nadwyżka trzyma się ' +
      'powyżej progu 1100 MW, a w pozostałych dniach nie ma podstaw.';

    expect(dlugi.length).toBeGreaterThan(200);
    expect(
      validateSummary({ ...good, outlook: dlugi }, new Set([...HOURS, '21:00']), [
        'wtorek 18 sierpnia',
      ])
    ).toEqual({ ok: true });
  });

  it('still refuses an answer that has genuinely run away', () => {
    expect(
      validateSummary({ ...good, outlook: 'a'.repeat(400) }, HOURS)
    ).toMatchObject({ ok: false });
  });

  describe('przesadzanie decyzji operatora', () => {
    /*
     * The regulation says when a declaration may be SKIPPED — surplus at or
     * above 1100 MW and no threat seen — and below the threshold that permission
     * simply falls away. Nothing obliges anyone to declare. And nothing here can
     * check the outcome: PSE publishes no announcements through any machine
     * interface, so a card that predicts one can never be held to it, while its
     * reader plans shifts against it.
     *
     * Said eleven times in seventy-two texts before a person reading them caught
     * it. The instruction forbids it as well, but an instruction is a request.
     */
    it.each([
      ['powinno zostać ogłoszone', 'W poniedziałek przywołanie powinno zostać ogłoszone o 20:00.'],
      ['zostanie ogłoszone', 'W poniedziałek przywołanie zostanie ogłoszone o 20:00.'],
      ['operator musi', 'W poniedziałek operator musi ogłosić przywołanie o 20:00.'],
    ])('refuses „%s"', (_label, body) => {
      expect(validateSummary({ ...good, body }, new Set(['20:00']))).toMatchObject({
        ok: false,
        reason: 'tekst przesądza decyzję operatora',
      });
    });

    it.each([
      ['może ogłosić', 'W poniedziałek operator może ogłosić przywołanie o 20:00.'],
      ['może nadejść', 'Ogłoszenie może jeszcze nadejść, bo zostało dość czasu.'],
      ['brak podstaw', 'W poniedziałek nie ma podstaw do przywołania o 20:00.'],
    ])('leaves „%s" alone', (_label, body) => {
      // What is left has to still be sayable, or the generator deadlocks.
      expect(validateSummary({ ...good, body }, new Set(['20:00']))).toEqual({
        ok: true,
      });
    });
  });

  describe('dzien tygodnia w liczbie mnogiej', () => {
    it('refuses the distributive form', () => {
      /*
       * Published once in sixty-one texts: "W środy, piątki i poniedziałek
       * 17 sierpnia margines jest wąski". That reads as every Wednesday and
       * every Friday, while the window holds exactly one of each — and the
       * reader is here to find out about a particular evening.
       */
      const mnoga = {
        ...good,
        outlook: 'W środy i piątki margines jest wąski.',
      };

      expect(validateSummary(mnoga, HOURS)).toMatchObject({
        ok: false,
        reason: 'dzień tygodnia w liczbie mnogiej',
      });
    });

    it.each([
      ['w środę i piątek', 'W środę i piątek margines jest wąski.'],
      ['do środy', 'Do środy margines pozostaje szeroki.'],
      ['od soboty', 'Od soboty margines rośnie.'],
    ])('leaves the singular alone: %s', (_label, outlook) => {
      // "środy" and "soboty" are the genitive singular as well as the plural,
      // so the rule hangs on the preposition — banning the bare word would
      // refuse correct Polish.
      expect(validateSummary({ ...good, outlook }, HOURS)).toEqual({ ok: true });
    });

    it('catches the form that takes "we"', () => {
      expect(
        validateSummary(
          { ...good, outlook: 'We wtorki margines jest wąski.' },
          HOURS
        )
      ).toMatchObject({ ok: false });
    });
  });

  it('refuses a headline with both lines beneath it empty', () => {
    // No shape ever asks for that, and it is the one combination the pairwise
    // rule above would otherwise let through.
    expect(
      validateSummary({ ...good, body: '', outlook: '' }, HOURS)
    ).toMatchObject({ ok: false });
  });

  it('lets the 1100 MW threshold through, since the facts hand it over', () => {
    // Banning it deadlocked the generator: the facts and the instruction both
    // put "próg 1100 MW" in front of the model, then every answer quoting it was
    // refused. It is a fixed figure from the regulation, not a reading of the
    // hour, so it cannot be wrong about the situation.
    const withThreshold = {
      ...good,
      body: 'Nadwyżka wciąż przekracza próg 1100 MW, więc operator ma prawo nie ogłaszać przywołania.',
    };

    expect(validateSummary(withThreshold, HOURS)).toEqual({ ok: true });
  });

  it('still refuses any other figure, even beside the permitted one', () => {
    const mixed = {
      ...good,
      body: 'Nadwyżka przekracza próg 1100 MW, a margines wynosi 250 MW.',
    };

    expect(validateSummary(mixed, HOURS).ok).toBe(false);
  });

  it('rejects a power figure, however it is written', () => {
    expect(
      validateSummary({ ...good, body: 'Margines spada do 177 MW.' }, HOURS).ok
    ).toBe(false);
    // Told not to use digits, one run simply spelled the figure out instead.
    expect(
      validateSummary(
        { ...good, body: 'Margines spada poniżej trzystu megawatów.' },
        HOURS
      ).ok
    ).toBe(false);
  });

  it('rejects a sentence that contradicts itself about coverage', () => {
    // Published once: the reserve "covers the required value, although the
    // margin is negative" — two descriptions of one fact set against each
    // other. There is no state in which both halves hold.
    const inverted = {
      ...good,
      body:
        'W poniedziałek rezerwa pokrywa wymaganą wartość, choć margines jest ujemny.',
    };

    const verdict = validateSummary(inverted, HOURS);
    expect(verdict.ok).toBe(false);
    expect(verdict).toMatchObject({ reason: expect.stringContaining('przeczy') });
  });

  it('allows the correct pairing, which the instruction actually demands', () => {
    // Checking for the two words alone rejected this — and the instruction asks
    // for exactly this sentence — so every run was refused and the published
    // text sat frozen while each rerun looked like "no change".
    const correct = {
      ...good,
      body: 'W czwartek o 20:00 margines jest ujemny, więc rezerwa nie pokrywa wymaganego poziomu.',
    };

    expect(validateSummary(correct, HOURS)).toEqual({ ok: true });
  });

  it('still allows the two words in separate sentences, where both can be true', () => {
    const fine = {
      ...good,
      body:
        'W niedzielę rezerwa pokrywa wymaganą wartość. W poniedziałek margines jest ujemny.',
    };

    expect(validateSummary(fine, HOURS).ok).toBe(true);
  });

  it('rejects the window metaphor, which reached a published summary', () => {
    // "The window stays open" — from my own wording of the facts, shortened by
    // the model until nothing was left to say what the window was.
    const metaphor = {
      ...good,
      body: 'Operator może nie ogłaszać przywołania, a okno pozostaje otwarte.',
    };

    expect(validateSummary(metaphor, HOURS).ok).toBe(false);
  });

  it('accepts the same fact said plainly', () => {
    const plain = {
      ...good,
      body: 'Operator może nie ogłaszać przywołania. Ogłoszenie może jeszcze nadejść.',
    };

    expect(validateSummary(plain, HOURS).ok).toBe(true);
  });

  it('rejects Polish written without its diacritics', () => {
    // The failure mode seen twice at looser settings, once producing a Hungarian
    // ű in place of ż. Raising the temperature for variety makes it likelier,
    // so it is refused outright rather than published.
    const stripped = {
      headline: 'Nie ma podstaw do ogloszenia okresu przywolania.',
      body: 'Rezerwa pokrywa wymagana wartosc przez caly czas.',
      outlook: 'W kolejnych dniach margines pozostaje bezpieczny.',
    };

    expect(validateSummary(stripped, HOURS).ok).toBe(false);
  });

  it('rejects an hour in the body with no day attached', () => {
    // Published on the first run of the cause layer: "O 20:00 wiatr spada
    // poniżej normy…" — written on a Tuesday about Thursday, with the day tabs
    // directly beneath the card. A card about timing must not leave the day to
    // be guessed.
    const verdict = validateSummary(
      { ...good, body: 'O 20:00 wiatr spada poniżej normy.' },
      HOURS
    );

    expect(verdict).toMatchObject({ ok: false, reason: expect.stringContaining('dnia') });
  });

  it.each(['w czwartek o 20:00', 'dziś o 20:00', 'jutro o 20:00'])(
    'accepts %s',
    (fragment) => {
      expect(
        validateSummary({ ...good, body: `Najciaśniej ${fragment}.` }, HOURS)
      ).toEqual({ ok: true });
    }
  );

  it('leaves a body without any hour alone', () => {
    // The rule is about an hour missing its day, not about demanding a day.
    expect(
      validateSummary(
        { ...good, body: 'Rezerwa pokrywa wymagany poziom przez cały okres.' },
        HOURS
      )
    ).toEqual({ ok: true });
  });

  it('rejects an hour that is not among the facts', () => {
    const verdict = validateSummary(
      { ...good, body: 'W czwartek najciaśniej będzie o 03:00.' },
      HOURS
    );
    expect(verdict.ok).toBe(false);
    expect(verdict).toMatchObject({ reason: expect.stringContaining('03:00') });
  });

  it('rejects any other number', () => {
    expect(
      validateSummary({ ...good, outlook: 'Dotyczy 3 kolejnych dni.' }, HOURS).ok
    ).toBe(false);
  });

  it('rejects an empty or runaway field', () => {
    expect(validateSummary({ ...good, headline: '  ' }, HOURS).ok).toBe(false);
    expect(
      validateSummary({ ...good, body: 'Zdanie. '.repeat(200) }, HOURS).ok
    ).toBe(false);
  });
});

describe('assessmentKey', () => {
  const day = (reserve: number) =>
    [19, 20].map((hour) => hourOn('2026-08-10', hour, { reserve, required: 2000 }));

  // A day whose hardest hour is plainly 20:00, so nothing is decided by a tie.
  const dayWithWorstAt20 = [
    hourOn('2026-08-10', 12, { reserve: 6000, required: 2000 }),
    hourOn('2026-08-10', 13, { reserve: 5800, required: 2000 }),
    hourOn('2026-08-10', 19, { reserve: 5000, required: 2000 }),
    hourOn('2026-08-10', 20, { reserve: 4000, required: 2000 }),
  ];

  it('ignores the hours ticking away, which is the whole point', () => {
    // Keyed on anything that moves each hour, the assessment would never look
    // unchanged and the model would run every hour regardless — exactly the
    // waste the check exists to prevent.
    const early = assessmentKey(
      buildFacts(dayWithWorstAt20, [], new Date('2026-08-10T00:00:00Z'))
    );
    const later = assessmentKey(
      buildFacts(dayWithWorstAt20, [], new Date('2026-08-10T14:00:00Z'))
    );

    expect(early).toBe(later);
  });

  it('does change once the hardest hour is behind us', () => {
    // Not an oversight: the summary named that hour, so it has to be rewritten.
    const before = assessmentKey(
      buildFacts(dayWithWorstAt20, [], new Date('2026-08-10T14:00:00Z'))
    );
    const after = assessmentKey(
      buildFacts(dayWithWorstAt20, [], new Date('2026-08-10T21:00:00Z'))
    );

    expect(before).not.toBe(after);
  });

  it('ignores a forecast nudged by a few megawatts', () => {
    const before = assessmentKey(buildFacts(day(5000), [], new Date('2026-08-09T00:00:00Z')));
    const after = assessmentKey(buildFacts(day(5010), [], new Date('2026-08-09T00:00:00Z')));

    expect(before).toBe(after);
  });

  it('changes when the verdict does', () => {
    const calm = assessmentKey(buildFacts(day(5000), [], new Date('2026-08-09T00:00:00Z')));
    const short = assessmentKey(buildFacts(day(800), [], new Date('2026-08-09T00:00:00Z')));

    expect(calm).not.toBe(short);
  });

  it('changes when a materially different margin arrives', () => {
    const before = assessmentKey(buildFacts(day(5000), [], new Date('2026-08-09T00:00:00Z')));
    const after = assessmentKey(buildFacts(day(3000), [], new Date('2026-08-09T00:00:00Z')));

    expect(before).not.toBe(after);
  });
});

describe('Kompas Energetyczny w instrukcji', () => {
  function kompasNa(
    businessDate: string,
    ...hours: Array<[number, CompassLevel]>
  ): Map<string, CompassHour[]> {
    return new Map([
      [
        businessDate,
        hours.map(([hour, level]) => ({
          businessDate,
          startUtc: new Date(`${businessDate}T${pad(hour)}:00:00Z`),
          hourLabel: `${pad(hour)}:00`,
          level,
        })),
      ],
    ]);
  }

  /** A day nothing is happening on: no grounds, and a comfortable margin. */
  const spokojna = Array.from({ length: 24 }, (_, hour) =>
    hourOn('2026-08-10', hour, { reserve: 6000, required: 2000 })
  );

  const fakty = (kompas: Map<string, CompassHour[]> = new Map()) =>
    buildFacts(
      spokojna,
      [],
      new Date('2026-08-09T00:00:00Z'),
      ['2026-08-10'],
      new Map(),
      kompas
    );

  it('gives the answer a slot for a signal on an otherwise quiet week', () => {
    /*
     * Without this a calm week carrying a flag chose the shape with no middle
     * line at all — the shape written for a period where there is genuinely
     * nothing to say — and the one thing in the facts that actually asks the
     * reader to do something never reached the card.
     */
    expect(hasSomethingToExplain(fakty())).toBe(false);
    expect(hasSomethingToExplain(fakty(kompasNa('2026-08-10', [19, 2])))).toBe(
      true
    );
  });

  it('explains the signal in every shape the prompt can take', () => {
    /*
     * The block sits outside both fragments `swap` replaces, so all three shapes
     * carry it. That is not incidental: a flag turns up on calm days and busy
     * ones alike, and a shape that dropped the explanation would hand the model
     * a fact it had never been told the meaning of — which is how "Kompas" would
     * get written up as a call period.
     *
     * `swap` throws rather than silently missing, so a future rewrite that moved
     * the block inside a swapped fragment fails here loudly.
     */
    const ksztalty = [
      // Nothing to explain: the two-line shape.
      fakty(),
      // A flag and nothing else: answer-first, no DALEJ.
      fakty(kompasNa('2026-08-10', [19, 2])),
      // Grounds for a call period: the full three-line shape.
      buildFacts(
        [hourOn('2026-08-10', 19, { reserve: 800, required: 2000 })],
        [],
        new Date('2026-08-09T00:00:00Z'),
        ['2026-08-10'],
        new Map(),
        kompasNa('2026-08-10', [19, 3])
      ),
    ];

    for (const facts of ksztalty) {
      const prompt = buildPrompt(facts, 30, new Date('2026-08-09T05:00:00Z'));
      expect(prompt).toContain('KOMPAS ENERGETYCZNY PSE');
      expect(prompt).toMatch(/NIE ŁĄCZ ich słowami/);
    }
  });

  it('shows the model no finished sentence about the signal either', () => {
    // Measured at 59 of 72 texts on this card: the model reproduces an
    // eight-word run from the instruction whenever the instruction contains one.
    // The block is directives addressed to the writer, never prose he could lift.
    const jedna = INSTRUCTION.split('\n').join(' ');

    for (const zdanie of [
      'Kompas Energetyczny PSE zaleca oszczędzanie',
      'Kompas Energetyczny PSE wymaga ograniczenia poboru',
      'operator zaleca oszczędzanie w godzinach',
    ]) {
      expect(jedna).not.toContain(zdanie);
    }
  });

  it('shows the model no word the validator goes on to reject', () => {
    /*
     * Scoped to the Kompas block rather than to the whole instruction, and
     * deliberately so. The DALEJ section quotes "cienki margines" inside a
     * worked TAK NIE PISZ example, naming the calque in order to refuse it —
     * that predates this layer and is its own decision. What this asserts is
     * that the NEW material adds no fresh instance of the pattern, which is the
     * rule this card has been bitten by four times: naming a phrase is how it
     * spreads.
     */
    const blok = INSTRUCTION.slice(
      INSTRUCTION.indexOf('KOMPAS ENERGETYCZNY PSE'),
      INSTRUCTION.indexOf('=== JAK PISZESZ ===')
    )
      .split('\n')
      .join(' ');

    expect(blok).toContain('Kompas Energetyczny PSE');
    for (const wzorzec of [
      /odstępstw/i,
      /dodatkow/i,
      /cienk\w*\s+margines/i,
      /\bhoryzon/i,
      /wezwan/i,
      /\bokn[oaie]\w*\b/i,
      /w godzinach (wieczorn|porann|popo|nocn)/i,
      // No megawatts and no clock times: an hour shown here is an hour the model
      // will copy into an answer, and the validator only accepts the ones the
      // facts actually stated for the day in hand.
      /\bMW\b/,
      /\d{1,2}:\d{2}/,
    ]) {
      expect(blok).not.toMatch(wzorzec);
    }
  });

  it('accepts a sentence naming an hour the Kompas put in the facts', () => {
    /*
     * The end-to-end shape of the deadlock guard: the hours reaching the prompt
     * and the hours the validator will accept come from the same function, so a
     * text naming a Kompas hour stands.
     */
    const facts = fakty(kompasNa('2026-08-10', [16, 2], [17, 2]));
    const hours = allowedHoursFor(facts);

    expect(
      validateSummary(
        {
          headline: 'Jutro nic nie zapowiada przywołania.',
          body: 'Kompas Energetyczny PSE zaleca jutro oszczędzanie od 16:00 do 18:00.',
          outlook: '',
        },
        hours,
        ['jutro']
      )
    ).toEqual({ ok: true });
  });

  it('refuses an hour the Kompas never stated', () => {
    const facts = fakty(kompasNa('2026-08-10', [16, 2], [17, 2]));

    expect(
      validateSummary(
        {
          headline: 'Jutro nic nie zapowiada przywołania.',
          body: 'Kompas Energetyczny PSE zaleca jutro oszczędzanie od 21:00 do 22:00.',
          outlook: '',
        },
        allowedHoursFor(facts),
        ['jutro']
      )
    ).toEqual({ ok: false, reason: 'godzina 21:00 spoza faktów' });
  });

  it('lets the proper name through the ban on numbers', () => {
    // "Kompas Energetyczny PSE" carries no digit, so nothing about the name
    // itself can trip the rule that refuses any figure we did not supply.
    expect(
      validateSummary(
        {
          headline: 'Kompas Energetyczny PSE zaleca jutro oszczędzanie o 16:00.',
          body: '',
          outlook: 'W pozostałych dobach operator nic nie sygnalizuje.',
        },
        new Set(['16:00']),
        ['jutro']
      )
    ).toEqual({ ok: true });
  });
});
