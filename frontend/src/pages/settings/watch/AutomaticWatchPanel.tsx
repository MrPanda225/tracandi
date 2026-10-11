import { useCallback, useId, useRef, useState } from 'react';
import { messageOf } from '../../../api/client';
import {
  type AutomaticWatch,
  type AutomaticWatchChoice,
  type AutomaticWatchPass,
  fetchAutomaticWatch,
  type PassLedBy,
  saveAutomaticWatch,
  WATCH_SLOTS,
  type WatchSlot,
} from '../../../api/autowatch';
import type { RunState } from '../../../api/jobs';
import { Flash } from '../../../components/Flash';
import { formatDateTime } from '../../../lib/format';
import type { Notice } from '../GmailSettings';
import {
  describeCounters,
  describeSlot,
  passOfSlot,
  type SlotState,
  slotStateOf,
  STATE_LABELS,
} from './passes';
import { useRunFeed } from './runFeed';
import { LoadFailure, PanelLoading, WatchSection } from './SectionParts';
import { useNow } from './useNow';
import { useResource } from './useResource';

/** EF-CFG-09: who led a pass, in words — never the address nor the name of a model (ENF-SEC-25). */
const LED_BY_LABELS: Readonly<Record<PassLedBy, string>> = { local: 'Modèle local', fallback: 'Secours' };

const clockFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** « Terminé à 07:12 » for a pass that is over, « Commencé à 07:00 » for one that goes on; nothing for the others. */
const describeTime = (pass: AutomaticWatchPass): string | null => {
  if (pass.outcome === 'running') return `Commencé à ${clockFormat.format(new Date(pass.startedAt))}`;
  if ((pass.outcome === 'success' || pass.outcome === 'failure') && pass.finishedAt) {
    return `Terminé à ${clockFormat.format(new Date(pass.finishedAt))}`;
  }
  return null;
};

type ChoiceChange = (choice: AutomaticWatchChoice) => void;

/**
 * EF-CFG-07: activate or stop the watch. A switch, because the change applies at once (HIG, MD3). The API refuses an
 * activation with no slot: it is not offered until one is ticked.
 */
function WatchSwitch({
  watch,
  isSaving,
  onChange,
}: {
  watch: AutomaticWatch;
  isSaving: boolean;
  onChange: ChoiceChange;
}) {
  const hintId = useId();
  const hasNoSlot = watch.slots.length === 0;
  return (
    <div className="gmail-card__setting">
      <label className="gmail-card__setting-row">
        <span className="gmail-card__setting-label">Lancer la veille automatiquement</span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={watch.enabled}
          disabled={isSaving || (!watch.enabled && hasNoSlot)}
          aria-describedby={hintId}
          onChange={(event) => onChange({ enabled: event.target.checked, slots: watch.slots })}
        />
      </label>
      <p id={hintId} className="gmail-card__hint">
        {watch.enabled
          ? 'Veille activée : Tracandi consulte vos sources aux créneaux choisis, sans que vous ayez rien à faire.'
          : 'Veille arrêtée : Tracandi ne consulte rien tout seul. Vous pouvez toujours consulter à la main depuis « Sites surveillés ».'}
      </p>
      {!watch.enabled && hasNoSlot && (
        <p className="gmail-card__hint">Cochez au moins un créneau pour activer la veille.</p>
      )}
    </div>
  );
}

/**
 * EF-CFG-07: the three slots, as choice chips ticked together (MD3). The last slot of an active watch cannot be
 * unticked: the API would answer 400.
 */
function SlotChoices({
  watch,
  isSaving,
  onChange,
}: {
  watch: AutomaticWatch;
  isSaving: boolean;
  onChange: ChoiceChange;
}) {
  const handleSlot = (slot: WatchSlot, isOn: boolean) =>
    onChange({
      enabled: watch.enabled,
      slots: WATCH_SLOTS.filter((candidate) => (candidate === slot ? isOn : watch.slots.includes(candidate))),
    });

  return (
    <fieldset className="watch-slots">
      <legend className="gmail-card__setting-label">Créneaux</legend>
      <div className="chips">
        {WATCH_SLOTS.map((slot) => {
          const isLast = watch.enabled && watch.slots.length === 1 && watch.slots.includes(slot);
          return (
            <label key={slot} className="chip">
              <input
                type="checkbox"
                checked={watch.slots.includes(slot)}
                disabled={isSaving || isLast}
                onChange={(event) => handleSlot(slot, event.target.checked)}
              />
              <span>{describeSlot(slot)}</span>
            </label>
          );
        })}
      </div>
      <p className="gmail-card__hint">
        Heure de Paris. Gardez au moins un créneau tant que la veille est activée.
      </p>
    </fieldset>
  );
}

/** A slot of the day, the state of its pass in a word and a dot, its numbers, and why when it was ignored (EF-CFG-08). */
function PassRow({
  slot,
  state,
  pass,
}: {
  slot: WatchSlot;
  state: SlotState;
  pass: AutomaticWatchPass | null;
}) {
  const time = pass && describeTime(pass);
  const counters = pass ? describeCounters(pass.counters) : [];
  return (
    <li className="watch-item watch-pass">
      <div className="watch-pass__head">
        <strong>{describeSlot(slot)}</strong>
        <span className={`watch-state watch-state--${state}`}>
          <span className="watch-state__dot" aria-hidden="true" />
          {STATE_LABELS[state]}
        </span>
        {pass?.ledBy && <span className="watch-tag watch-tag--model">{LED_BY_LABELS[pass.ledBy]}</span>}
      </div>
      {time && <p className="gmail-card__hint">{time}</p>}
      {counters.length > 0 && <p className="watch-pass__counters">{counters.join(' · ')}</p>}
      {pass?.message && <p className="watch-pass__message">{pass.message}</p>}
    </li>
  );
}

/** EF-CFG-08, EF-CFG-09: the three passes of the day, and the date of the last one that succeeded. */
function PassList({ watch }: { watch: AutomaticWatch }) {
  const titleId = useId();
  const now = useNow();
  const isLedByShown = watch.passes.some((pass) => pass.ledBy !== null);
  return (
    <div className="watch-passes">
      <h4 id={titleId} className="watch-level__title">
        Passages du jour
      </h4>
      <ul className="watch-items" aria-labelledby={titleId}>
        {WATCH_SLOTS.map((slot) => (
          <PassRow
            key={slot}
            slot={slot}
            state={slotStateOf(slot, watch, now)}
            pass={passOfSlot(watch.passes, slot)}
          />
        ))}
      </ul>
      <p className="gmail-card__hint">
        {watch.lastSuccessAt
          ? `Dernier passage réussi : ${formatDateTime(watch.lastSuccessAt)}`
          : 'Aucun passage réussi pour l’instant.'}
      </p>
      {isLedByShown && (
        <p className="gmail-card__hint">
          « Modèle local » : le modèle de l’éditeur a noté les offres. « Secours » : un fournisseur hébergé a
          pris le relais.
        </p>
      )}
    </div>
  );
}

/**
 * EF-CFG-07 to EF-CFG-09: the watch that runs by itself — activated or stopped, the slots it uses (7 h, 13 h and 19 h,
 * Paris time), and what the passes of the day did. A pass tells its state, its numbers and, when it was ignored or
 * failed, why; never an offer nor a text (ENF-RGP-12). The passes are read again when a scheduled pass changes state
 * (EF-EXE-04).
 */
export function AutomaticWatchPanel() {
  const { resource, reload, replace } = useResource(fetchAutomaticWatch);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const outcomes = useRef(new Map<number, RunState['outcome']>());

  // A pass that goes on reports its counters at every step: only a change of state is worth reading the day again.
  const handleRun = useCallback(
    (run: RunState) => {
      if (run.job !== 'scraper' || run.trigger !== 'schedule' || outcomes.current.get(run.id) === run.outcome)
        return;
      outcomes.current.set(run.id, run.outcome);
      void reload();
    },
    [reload],
  );
  useRunFeed(handleRun);

  const handleChange = async (choice: AutomaticWatchChoice) => {
    setIsSaving(true);
    setNotice(null);
    try {
      replace(await saveAutomaticWatch(choice));
    } catch (failure) {
      setNotice({ tone: 'error', text: messageOf(failure) });
    } finally {
      setIsSaving(false);
    }
  };

  const watch = resource.status === 'ready' ? resource.value : null;
  return (
    <WatchSection title="Créneaux et passages">
      {resource.status === 'loading' && <PanelLoading label="Chargement des créneaux et des passages…" />}
      {resource.status === 'error' && (
        <LoadFailure message={resource.message} onRetry={() => void reload()} />
      )}
      {notice && <Flash tone={notice.tone}>{notice.text}</Flash>}
      {watch && (
        <>
          <WatchSwitch watch={watch} isSaving={isSaving} onChange={(choice) => void handleChange(choice)} />
          <SlotChoices watch={watch} isSaving={isSaving} onChange={(choice) => void handleChange(choice)} />
          <PassList watch={watch} />
        </>
      )}
    </WatchSection>
  );
}
