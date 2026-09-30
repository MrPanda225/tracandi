import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  APPLICATION_ORDERS,
  type Application,
  type ApplicationOrder,
  DEFAULT_ORDER,
  type NewApplication,
} from '../../api/applications';
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
  orderBy: ApplicationOrder;
  /** EF-CAN-24: « YYYY-MM-DD » of the date fields, empty when not set. */
  appliedFrom: string;
  appliedTo: string;
}

const ORDERS = Object.keys(APPLICATION_ORDERS) as ApplicationOrder[];
const toOrder = (value: string): ApplicationOrder => ORDERS.find((order) => order === value) ?? DEFAULT_ORDER;

interface CompanyGroup {
  company: Application['company'];
  applications: Application[];
}

/** EF-CAN-01: sorted by company, each company's applications are contiguous. */
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
  const ids = {
    search: useId(),
    status: useId(),
    contract: useId(),
    order: useId(),
    from: useId(),
    to: useId(),
  };
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
      <div className="form-field applications-filters__order">
        <label className="form-field__label" htmlFor={ids.order}>
          Trier par
        </label>
        <select
          id={ids.order}
          className="control"
          value={filters.orderBy}
          onChange={(event) => onChange({ ...filters, orderBy: toOrder(event.target.value) })}
        >
          {ORDERS.map((order) => (
            <option key={order} value={order}>
              {APPLICATION_ORDERS[order].label}
            </option>
          ))}
        </select>
      </div>
      {/* EF-CAN-24: the period of application, each bound optional. */}
      <div className="form-field">
        <label className="form-field__label" htmlFor={ids.from}>
          Candidature du
        </label>
        <input
          id={ids.from}
          type="date"
          className="control"
          value={filters.appliedFrom}
          max={filters.appliedTo || undefined}
          onChange={(event) => onChange({ ...filters, appliedFrom: event.target.value })}
        />
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor={ids.to}>
          au
        </label>
        <input
          id={ids.to}
          type="date"
          className="control"
          value={filters.appliedTo}
          min={filters.appliedFrom || undefined}
          onChange={(event) => onChange({ ...filters, appliedTo: event.target.value })}
        />
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

const dayKeyOf = (iso: string): string => new Date(iso).toLocaleDateString('fr-CA');
const DAY_MS = 24 * 60 * 60 * 1000;
const weekdayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const weekdayYearFormat = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** « Aujourd’hui », « Hier », « lundi 28 septembre » — the year only when it is not this one. */
const dayLabelOf = (iso: string, now: Date): string => {
  const key = dayKeyOf(iso);
  if (key === dayKeyOf(now.toISOString())) return 'Aujourd’hui';
  if (key === dayKeyOf(new Date(now.getTime() - DAY_MS).toISOString())) return 'Hier';
  const date = new Date(iso);
  const label = (date.getFullYear() === now.getFullYear() ? weekdayFormat : weekdayYearFormat).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

interface Section {
  key: string;
  label: string;
  applications: Application[];
}

/**
 * Wurman's time axis: sorted by a date, the applications of a day go under the heading of that day, instead of the
 * same date written on every line; sorted by status, under the heading of the status. Consecutive only, as the API
 * sorts them.
 */
const sectionsOf = (
  applications: readonly Application[],
  orderBy: ApplicationOrder,
  now: Date,
): Section[] => {
  const sectionOf = (application: Application): { key: string; label: string } => {
    if (orderBy === 'status') return { key: application.status, label: STATUS_LABELS[application.status] };
    const iso = orderBy === 'activity' ? application.lastActivityAt : application.appliedAt;
    return { key: dayKeyOf(iso), label: dayLabelOf(iso, now) };
  };
  const sections: Section[] = [];
  for (const application of applications) {
    const { key, label } = sectionOf(application);
    const last = sections.at(-1);
    if (last?.key === key) last.applications.push(application);
    else sections.push({ key, label, applications: [application] });
  }
  return sections;
};

/**
 * EF-CAN-20: in any other order than by company, the applications under headings of day or status, each application
 * naming its company.
 */
function SectionedList({ list, orderBy }: { list: ApplicationList; orderBy: ApplicationOrder }) {
  const isByApplicationDay = orderBy === 'recent' || orderBy === 'oldest';
  // One list for every section: an application whose date changes moves under another heading without being
  // rebuilt, so its opened detail stays open.
  return (
    <ul className="company-group company-group__list applications-list--flat">
      {sectionsOf(list.items, orderBy, new Date()).flatMap((section) => [
        <li key={`section-${section.key}`} className="applications-section">
          <h2 className="applications-section__title">
            {section.label}
            <span className="applications-section__count">{section.applications.length}</span>
          </h2>
        </li>,
        ...section.applications.map((application) => (
          <ApplicationItem
            key={application.id}
            application={application}
            showsCompany
            isDated={isByApplicationDay}
            onUpdated={list.replaceItem}
            onDeleted={list.removeItem}
          />
        )),
      ])}
    </ul>
  );
}

function MoreButton({ list }: { list: ApplicationList }) {
  const remaining = list.total - list.items.length;
  if (remaining <= 0) return null;
  return (
    <button
      type="button"
      className="btn btn--quiet applications-list__more"
      disabled={list.isLoadingMore}
      aria-busy={list.isLoadingMore}
      onClick={() => void list.loadMore()}
    >
      {list.isLoadingMore ? 'Chargement…' : `Afficher plus (${plural(remaining, 'restante')})`}
    </button>
  );
}

function ApplicationsList({ list, orderBy }: { list: ApplicationList; orderBy: ApplicationOrder }) {
  return (
    <div className="applications-list" aria-busy={list.isLoading}>
      {orderBy === 'company' ? (
        <CompanyGroups list={list} />
      ) : (
        <SectionedList list={list} orderBy={orderBy} />
      )}
      <MoreButton list={list} />
    </div>
  );
}

function CompanyGroups({ list }: { list: ApplicationList }) {
  const baseId = useId();
  return (
    <>
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
                <span className="company-group__count">
                  {plural(group.applications.length, 'candidature')}
                </span>
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
    </>
  );
}

/**
 * Applications screen (T-103): every application, the most recent first or in the order chosen — grouped by company
 * when sorted by company (EF-CAN-01, 20) —, filters by status, contract type and period (EF-CAN-02, 14, 24), search (EF-CAN-03), chronology and Gmail links (EF-CAN-04, 05), manual creation and status
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
    orderBy: lastFilters?.orderBy ?? DEFAULT_ORDER,
    appliedFrom: lastFilters?.appliedFrom ?? '',
    appliedTo: lastFilters?.appliedTo ?? '',
  }));
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const list = useApplications({
    ...filters,
    appliedFrom: filters.appliedFrom || undefined,
    appliedTo: filters.appliedTo || undefined,
  });
  const hasFilters = Boolean(
    filters.status ?? filters.contractType ?? (filters.q.trim() || filters.appliedFrom || filters.appliedTo),
  );

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
        <p>Chaque candidature et l’historique de ses messages, dans l’ordre que vous choisissez.</p>
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
      {list.items.length > 0 && <ApplicationsList list={list} orderBy={filters.orderBy} />}
    </>
  );
}
