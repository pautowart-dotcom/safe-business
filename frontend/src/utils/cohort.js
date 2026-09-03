// Когорта "новый Обзор" (03.09.2026) — общая точка для всех мест, которые
// решают "эта компания видит новую ленту наблюдения/урезанную навигацию, или
// прежний интерфейс": Dashboard.jsx и Layout.jsx. Одна константа, а не копия
// в каждом файле — иначе дата отсечения рано или поздно разойдётся.
export const NEW_COHORT_CUTOFF = new Date('2026-09-03T00:00:00Z');

export function isNewCohort(company) {
  return !!company?.created_at && new Date(company.created_at) >= NEW_COHORT_CUTOFF;
}
