import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Application, NewApplication } from '../../api/applications';
import type { ApplicationStatus, ContractType } from '../../api/stats';
import { Flash } from '../../components/Flash';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import {
  APPLICATION_STATUSES,
  CONTRACT_LABELS,
  CONTRACT_TYPES,
  STATUS_LABELS,
  plural,
  toApplicationStatus,
  toContractType,
} from '../../lib/format';
import { ApplicationItem } from './ApplicationItem';
import { NewApplicationForm } from './NewApplicationForm';
import { type ApplicationList, useApplications, useLastApplicationFilters } from './useApplications';
import './ApplicationsPage.css';

const SEARCH_MAX_LENGTH = 100;
const SKELETON_GROUPS = [2, 1, 3];

interface Filters {
  status?: ApplicationStatus;
  contractType?: ContractType;
  q: string;
}

interface CompanyGroup {
  company: Application['company'];
  applications: Application[];
}

/** EF-CAN-01: the API sorts by company name, so each company's applications are contiguous. */
const groupByCompany = (applications: readonly Application[]): CompanyGroup[] => {
  const groups: CompanyGroup[] = [];
  for (const application of applications) {
    const last = groups.at(-1);
    if (last?.company.id === application.company.id) last.applications.push(application);
    else groups.push({ company: application.company, applications: [application] });
  }
  return groups;
};

function FilterBar({ filters, onChange }: { filters: Filters; onChange: (filters: Filters) => void }) {
  const ids = { search: useId(), status: useId(), contract: useId() };
  return (
    <form role="search" className="applications-filters" onSubmit={(event) => event.preventDefault()}>
      <div className="form-field applications-filters__search">
        <label className="form-field__label" htmlFor={ids.search}>
          Rechercher
        </label>
        <input
          id={ids.search}
          type="search"
          className="control"
          placeholder="Entreprise ou intitulé du poste"
          maxLength={SEARCH_MAX_LENGTH}
          value={filters.q}
          onChange={(event) => onChange({ ...filters, q: event.target.value })}
        />
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor={ids.status}>
          Statut
        </label>
        <select
          id={ids.status}
          className="control"
          value={filters.status ?? ''}
          onChange={(event) => onChange({ ...filters, status: toApplicationStatus(event.target.value) })}
        >
          <option value="">Tous</option>
          {APPLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor={ids.contract}>
          Type de contrat
        </label>
        <select
          id={ids.contract}
          className="control"
          value={filters.contractType ?? ''}
          onChange={(event) => onChange({ ...filters, contractType: toContractType(event.target.value) })}
        >
          <option value="">Tous</option>
          {CONTRACT_TYPES.map((type) => (
            <option key={type} value={type}>
              {CONTRACT_LABELS[type]}
            </option>
          ))}
        </select>
      </div>
    </form>
  );
}

function ListSkeleton() {
  return (
    <div className="applications-list" role="status" aria-live="polite">
      <span className="visually-hidden">Chargement des candidatures…</span>
      {SKELETON_GROUPS.map((rows, group) => (
        <div key={group} className="company-group" aria-hidden="true">
          <Skeleton width="30%" height="1.1rem" />
          {Array.from({ length: rows }, (_, row) => (
            <Skeleton key={row} width="100%" height="3.25rem" />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return hasFilters ? (
    <p className="applications-empty">Aucune candidature ne correspond à ces critères.</p>
  ) : (
    <p className="applications-empty">
      Aucune candidature pour l’instant. Ajoutez-en une avec le bouton ci-dessus ; une fois Gmail connecté
      dans les <Link to="/reglages">Réglages</Link>, elles apparaîtront d’elles-mêmes.
    </p>
  );
}

function CompanyGroups({ list }: { list: ApplicationList }) {
  const baseId = useId();
  const remaining = list.total - list.items.length;
  return (
    <div className="applications-list" aria-busy={list.isLoading}>
      {groupByCompany(list.items).map((group) => {
        const headingId = `${baseId}-company-${group.company.id}`;
        return (
          <section key={group.company.id} className="company-group" aria-labelledby={headingId}>
            <div className="company-group__header">
              <h2 id={headingId} className="company-group__name">
                {group.company.name}
              </h2>
              {/* Counted only when there is more than one: « 1 candidature » under every company was noise. */}
              {group.applications.length > 1 && (
                <span className="company-group__count">{plural(group.applications.length, 'candidature')}</span>
              )}
            </div>
            <ul className="company-group__list">
              {group.applications.map((application) => (
                <ApplicationItem
                  key={application.id}
                  application={application}
                  onUpdated={list.replaceItem}
                  onDeleted={list.removeItem}
                />
              ))}
            </ul>
          </section>
        );
      })}
      {remaining > 0 && (
        <button
          type="button"
          className="btn btn--quiet applications-list__more"
          disabled={list.isLoadingMore}
          aria-busy={list.isLoadingMore}
          onClick={() => void list.loadMore()}
        >
          {list.isLoadingMore ? 'Chargement…' : `Afficher plus (${plural(remaining, 'restante')})`}
        </button>
      )}
    </div>
  );
}

/**
 * Applications screen (T-103): every application grouped by company (EF-CAN-01), filters by status and contract
 * type (EF-CAN-02, 14), search (EF-CAN-03), chronology and Gmail links (EF-CAN-04, 05), manual creation and status
 * change (EF-CAN-06, 07), « à relancer » badge (EF-CAN-12).
 */
export function ApplicationsPage() {
  const formId = useId();
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const lastFilters = useLastApplicationFilters();
  const [filters, setFilters] = useState<Filters>(() => ({
    status: lastFilters?.status,
    contractType: lastFilters?.contractType,
    q: lastFilters?.q ?? '',
  }));
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const list = useApplications(filters);
  const hasFilters = Boolean(filters.status ?? filters.contractType ?? filters.q.trim());

  // The form unmounts on close: keyboard focus goes back to the button that opened it.
  const closeForm = () => {
    setIsFormOpen(false);
    addButtonRef.current?.focus();
  };

  const handleCreated = (created: NewApplication) => {
    closeForm();
    setConfirmation(`Candidature ajoutée : ${created.jobTitle} chez ${created.companyName}.`);
    list.reload();
  };

  const openForm = () => {
    setConfirmation(null);
    setIsFormOpen((open) => !open);
  };

  return (
    <>
      <PageHeader
        title="Candidatures"
        eyebrow={list.hasLoaded ? plural(list.total, hasFilters ? 'résultat' : 'candidature') : undefined}
      >
        <p>Chaque candidature, groupée par entreprise, avec l’historique de ses messages.</p>
      </PageHeader>

      <div className="applications-actions">
        <button
          ref={addButtonRef}
          type="button"
          className="btn"
          aria-expanded={isFormOpen}
          aria-controls={formId}
          onClick={openForm}
        >
          Ajouter une candidature
        </button>
      </div>

      {isFormOpen && <NewApplicationForm id={formId} onCreated={handleCreated} onCancel={closeForm} />}
      {confirmation && <Flash tone="success">{confirmation}</Flash>}

      <FilterBar filters={filters} onChange={setFilters} />

      {list.error && <Flash>{list.error}</Flash>}
      {!list.hasLoaded && !list.error && <ListSkeleton />}
      {list.hasLoaded && list.items.length === 0 && <EmptyState hasFilters={hasFilters} />}
      {list.items.length > 0 && <CompanyGroups list={list} />}
    </>
  );
}
