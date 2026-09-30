import { useState } from 'react';
import { messageOf } from '../../api/client';
import type { NewSource, Source, SourceType } from '../../api/sites';
import { Flash } from '../../components/Flash';

/** RG-08 (v1.33) : une source officielle n'a pas d'identifiant à elle ; cette valeur fixe désigne les critères. */
const CRITERIA_IDENTIFIER = 'criteres';

/**
 * EF-VEI-32 : les sources officielles, activées d'un geste. Elles ne demandent ni entreprise ni identifiant : elles
 * sont interrogées selon les critères de recherche, et une fois ajoutées elles se gèrent dans la liste des sources.
 * @req EF-VEI-32
 */
export function OfficialSources({
  types,
  sources,
  onAdd,
}: {
  types: readonly SourceType[];
  sources: readonly Source[];
  onAdd: (source: NewSource) => Promise<void>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const available = types.filter(
    (type) => type.isOfficial && !sources.some((source) => source.adapter === type.id),
  );

  if (available.length === 0) return null;

  const handleAdd = async (type: SourceType) => {
    setPending(type.id);
    setFailure(null);
    try {
      await onAdd({ adapter: type.id, identifier: CRITERIA_IDENTIFIER });
    } catch (error) {
      setFailure(messageOf(error));
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="official" aria-labelledby="official-title">
      <h2 id="official-title" className="official__title">
        Sources officielles
      </h2>
      <p className="official__text">
        Les offres de tous les employeurs, lues selon ce que vous recherchez. Gratuites, sans compte de votre part.
      </p>
      <ul className="official__list">
        {available.map((type) => (
          <li key={type.id}>
            <button
              type="button"
              className="btn btn--quiet"
              disabled={pending !== null}
              aria-busy={pending === type.id}
              onClick={() => void handleAdd(type)}
            >
              {pending === type.id ? 'Activation…' : `Activer ${type.label}`}
            </button>
          </li>
        ))}
      </ul>
      {failure !== null && <Flash>{failure}</Flash>}
    </section>
  );
}
