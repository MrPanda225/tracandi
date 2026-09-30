import { type FormEvent, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteMyAccount, downloadMyData } from '../../api/account';
import { messageOf } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Flash } from '../../components/Flash';
import { saveFile } from '../../lib/browser';

/** EF-AUT-12: every datum held on the user, in one file. */
function ExportAction() {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setIsBusy(true);
    setError(null);
    try {
      saveFile(await downloadMyData());
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="gmail-card__setting">
      <p className="gmail-card__hint">
        Un fichier JSON avec tout ce que Tracandi conserve sur vous : compte, candidatures, messages, réglages.
      </p>
      {error && <Flash>{error}</Flash>}
      <div>
        <button
          type="button"
          className="btn btn--quiet"
          disabled={isBusy}
          aria-busy={isBusy}
          onClick={() => void handleExport()}
        >
          {isBusy ? 'Préparation…' : 'Télécharger mes données'}
        </button>
      </div>
    </div>
  );
}

/** EF-AUT-11: deletion of the account, behind the password (HIG: destructive, confirmed, apart). */
function DeleteAction() {
  const { forgetAccount } = useAuth();
  const passwordId = useId();
  const [isConfirming, setIsConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    try {
      await deleteMyAccount(password);
      forgetAccount();
    } catch (failure) {
      setError(messageOf(failure));
      setIsBusy(false);
    }
  };

  if (!isConfirming) {
    return (
      <div className="gmail-card__setting">
        <p className="gmail-card__hint">
          Supprime votre compte et toutes vos données, et révoque l’accès de Tracandi à Gmail. C’est définitif.
        </p>
        <div>
          <button type="button" className="btn btn--quiet btn--quiet-danger" onClick={() => setIsConfirming(true)}>
            Supprimer mon compte
          </button>
        </div>
      </div>
    );
  }
  return (
    <form className="gmail-card__setting" onSubmit={(event) => void handleDelete(event)}>
      <p className="gmail-card__hint">
        Saisissez votre mot de passe pour confirmer. Tout sera supprimé : candidatures, messages conservés, profil et
        connexion Gmail.
      </p>
      {error && <Flash>{error}</Flash>}
      <label htmlFor={passwordId} className="gmail-card__setting-label">
        Mot de passe
      </label>
      <input
        id={passwordId}
        type="password"
        className="control my-data__password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <div className="gmail-card__buttons">
        <button type="button" className="btn btn--quiet" onClick={() => setIsConfirming(false)}>
          Annuler
        </button>
        <button type="submit" className="btn btn--danger" disabled={isBusy || password === ''} aria-busy={isBusy}>
          {isBusy ? 'Suppression…' : 'Supprimer définitivement'}
        </button>
      </div>
    </form>
  );
}

/** « Mes données » (EF-AUT-11, EF-AUT-12): the GDPR rights the candidate exercises alone. */
export function MyDataCard() {
  const titleId = useId();
  return (
    <section className="settings-card" aria-labelledby={titleId}>
      <h2 id={titleId} className="settings-card__title">
        Mes données
      </h2>
      <p className="settings-card__lede">
        Vos droits sur vos données, exercés ici même. Le détail est dans la{' '}
        <Link to="/confidentialite">politique de confidentialité</Link>.
      </p>
      <section className="gmail-card__section" aria-label="Télécharger">
        <h3 className="gmail-card__section-title">Télécharger</h3>
        <ExportAction />
      </section>
      <section className="gmail-card__section" aria-label="Supprimer">
        <h3 className="gmail-card__section-title">Supprimer</h3>
        <DeleteAction />
      </section>
    </section>
  );
}
