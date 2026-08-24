import { useId, useState, type ReactNode } from 'react';
import { ServantFilterIcon } from './ServantFilterIcon';
import {
  allServantClasses,
  extraServantClasses,
  npCardIconUrl,
  npCardLabel,
  servantClassIconUrl,
  standardServantClasses,
  type ServantClassOption,
} from './servantFilterOptions';
import { toggleFilterValue, type ServantFilterState } from './servantFilters';
import './servant-filters.css';

export function ServantClassQuickFilter({
  classId,
  onChange,
}: {
  classId: string | null;
  onChange: (classId: string | null) => void;
}) {
  const generatedId = useId();
  const [extraOpen, setExtraOpen] = useState(false);
  const renderOptions = (options: ServantClassOption[]) =>
    options.map((option) => (
      <button
        type="button"
        key={option.id}
        className="servant-class-button"
        aria-label={option.label}
        title={option.label}
        aria-pressed={classId === option.id}
        onClick={() => onChange(classId === option.id ? null : option.id)}
      >
        <ServantFilterIcon
          className="servant-class-icon"
          src={servantClassIconUrl(option)}
          fallback={option.label.slice(0, 1)}
        />
      </button>
    ));

  return (
    <div className="servant-class-quick-filter" role="group" aria-label="クラス">
      <div className="servant-class-quick-row">
        <button
          type="button"
          className="servant-class-all"
          aria-pressed={classId === null}
          onClick={() => onChange(null)}
        >
          全
        </button>
        {renderOptions(standardServantClasses)}
        <button
          type="button"
          className="servant-extra-toggle"
          aria-expanded={extraOpen}
          aria-controls={`${generatedId}-extra`}
          onClick={() => setExtraOpen((current) => !current)}
        >
          EXTRA {extraOpen ? '▲' : '▼'}
        </button>
      </div>
      {extraOpen ? (
        <div id={`${generatedId}-extra`} className="servant-class-quick-row extra">
          {renderOptions(extraServantClasses)}
        </div>
      ) : null}
    </div>
  );
}

export function ServantAdvancedFilterFields({
  filters,
  onChange,
  showNpFilters,
  children,
}: {
  filters: ServantFilterState;
  onChange: (filters: ServantFilterState) => void;
  showNpFilters: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      <fieldset className="servant-advanced-filter-group">
        <legend>レア度</legend>
        <div className="servant-advanced-filter-options rarity">
          {[5, 4, 3, 2, 1, 0].map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={filters.rarities.has(value)}
              onClick={() =>
                onChange({
                  ...filters,
                  rarities: toggleFilterValue(filters.rarities, value),
                })
              }
            >
              ★{value}
            </button>
          ))}
        </div>
      </fieldset>
      {children}
      {showNpFilters ? (
        <>
          <fieldset className="servant-advanced-filter-group">
            <legend>宝具タイプ</legend>
            <div className="servant-advanced-filter-options cards">
              {(['buster', 'arts', 'quick'] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-label={npCardLabel(value)}
                  aria-pressed={filters.npCards.has(value)}
                  onClick={() =>
                    onChange({
                      ...filters,
                      npCards: toggleFilterValue(filters.npCards, value),
                    })
                  }
                >
                  <ServantFilterIcon
                    className="servant-card-filter-icon"
                    src={npCardIconUrl(value)}
                    fallback={value.slice(0, 1).toUpperCase()}
                  />
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="servant-advanced-filter-group">
            <legend>宝具範囲</legend>
            <div className="servant-advanced-filter-options">
              {(['all', 'single'] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={filters.npTargets.has(value)}
                  onClick={() =>
                    onChange({
                      ...filters,
                      npTargets: toggleFilterValue(filters.npTargets, value),
                    })
                  }
                >
                  {value === 'all' ? '全体' : '単体'}
                </button>
              ))}
            </div>
          </fieldset>
        </>
      ) : null}
    </>
  );
}

export function ServantFilterChips({
  filters,
  onChange,
  showNpFilters,
  children,
}: {
  filters: ServantFilterState;
  onChange: (filters: ServantFilterState) => void;
  showNpFilters: boolean;
  children?: ReactNode;
}) {
  const selectedClass = allServantClasses.find((option) => option.id === filters.classId);
  const hasBaseChips =
    selectedClass ||
    filters.rarities.size > 0 ||
    (showNpFilters && (filters.npCards.size > 0 || filters.npTargets.size > 0));
  if (!hasBaseChips && !children) return null;
  return (
    <div className="servant-filter-chips" aria-label="適用中の絞り込み">
      {selectedClass ? (
        <button type="button" onClick={() => onChange({ ...filters, classId: null })}>
          {selectedClass.label} <span aria-hidden="true">×</span>
        </button>
      ) : null}
      {filters.rarities.size > 0 ? (
        <button type="button" onClick={() => onChange({ ...filters, rarities: new Set() })}>
          {[...filters.rarities]
            .sort((left, right) => right - left)
            .map((value) => `★${String(value)}`)
            .join('・')}{' '}
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
      {showNpFilters && filters.npCards.size > 0 ? (
        <button type="button" onClick={() => onChange({ ...filters, npCards: new Set() })}>
          {[...filters.npCards].map(npCardLabel).join('・')} <span aria-hidden="true">×</span>
        </button>
      ) : null}
      {showNpFilters && filters.npTargets.size > 0 ? (
        <button type="button" onClick={() => onChange({ ...filters, npTargets: new Set() })}>
          {[...filters.npTargets].map((value) => (value === 'all' ? '全体' : '単体')).join('・')}{' '}
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
      {children}
    </div>
  );
}
