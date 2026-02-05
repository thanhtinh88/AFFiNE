import type { DocsService } from '@affine/core/modules/doc';
import type { WorkspacePropertyFilter } from '@affine/core/modules/workspace-property';
import { Service } from '@toeverything/infra';
import dayjs, { type Dayjs, isDayjs } from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear'; // ← THÊM DÒNG NÀY

dayjs.extend(quarterOfYear); // ← EXTEND PLUGIN
import { map, type Observable } from 'rxjs';

import type { FilterProvider } from '../../provider';
import type { FilterParams } from '../../types';

export class DatePropertyFilterProvider
  extends Service
  implements FilterProvider
{
  constructor(private readonly docsService: DocsService) {
    super();
  }

  filter$(params: FilterParams): Observable<Set<string>> {
    return this.docsService
      .propertyValues$('custom:' + params.key)
      .pipe(basicDateFilter(params));
  }
}

export function basicDateFilter(
  params: FilterParams
): (
  upstream$: Observable<Map<string, string | number | undefined>>
) => Observable<Set<string>> {
  return upstream$ => {
    const filterValues = (params.value
      ?.split(',')
      .map(t => parseDate(t))
      .filter(Boolean) ?? []) as [number, number, number][];

    const now = dayjs();
    const method = params.method as WorkspacePropertyFilter<'date'>;

    return upstream$.pipe(
      map(o => {
        if (method === 'is-empty' || method === 'is-not-empty') {
          const match = new Set<string>();
          for (const [id, value] of o) {
            if (method === 'is-empty' ? !value : !!value) {
              match.add(id);
            }
          }
          return match;
        }

        if (method === 'between' && filterValues.length >= 2) {
          return handleDateRangeFilter(
            o,
            parsed =>
              isAfterOrEqual(parsed, filterValues[0]) &&
              isBeforeOrEqual(parsed, filterValues[1])
          );
        }

        if (method === 'after' && filterValues.length >= 1) {
          return handleDateRangeFilter(o, parsed =>
            isAfter(parsed, filterValues[0])
          );
        }

        if (method === 'before' && filterValues.length >= 1) {
          return handleDateRangeFilter(o, parsed =>
            isBefore(parsed, filterValues[0])
          );
        }

        // FIX: Xử lý relative ranges với upper & lower bounds
        if (method === 'last-3-days') {
          return handleDateRangeFilter(
            o,
            parsed =>
              isAfterOrEqual(parsed, now.subtract(3, 'day')) &&
              isBeforeOrEqual(parsed, now)
          );
        }

        if (method === 'last-7-days') {
          return handleDateRangeFilter(
            o,
            parsed =>
              isAfterOrEqual(parsed, now.subtract(7, 'day')) &&
              isBeforeOrEqual(parsed, now)
          );
        }

        if (method === 'last-15-days') {
          return handleDateRangeFilter(
            o,
            parsed =>
              isAfterOrEqual(parsed, now.subtract(15, 'day')) &&
              isBeforeOrEqual(parsed, now)
          );
        }

        if (method === 'last-30-days') {
          return handleDateRangeFilter(
            o,
            parsed =>
              isAfterOrEqual(parsed, now.subtract(30, 'day')) &&
              isBeforeOrEqual(parsed, now)
          );
        }

        // Thêm mới filters
        if (method === 'next-3-days') {
          return handleDateRangeFilter(
            o,
            parsed =>
              isAfterOrEqual(parsed, now) &&
              isBeforeOrEqual(parsed, now.add(3, 'day'))
          );
        }

        if (method === 'next-7-days') {
          return handleDateRangeFilter(
            o,
            parsed =>
              isAfterOrEqual(parsed, now) &&
              isBeforeOrEqual(parsed, now.add(7, 'day'))
          );
        }

        if (method === 'next-15-days') {
          return handleDateRangeFilter(
            o,
            parsed =>
              isAfterOrEqual(parsed, now) &&
              isBeforeOrEqual(parsed, now.add(15, 'day'))
          );
        }

        if (method === 'next-30-days') {
          return handleDateRangeFilter(
            o,
            parsed =>
              isAfterOrEqual(parsed, now) &&
              isBeforeOrEqual(parsed, now.add(30, 'day'))
          );
        }

        if (method === 'this-week') {
          return handleDateRangeFilter(
            o,
            parsed =>
              isAfterOrEqual(parsed, now.startOf('week')) &&
              isBeforeOrEqual(parsed, now.endOf('week'))
          );
        }

        if (method === 'this-month') {
          return handleDateRangeFilter(
            o,
            parsed =>
              isAfterOrEqual(parsed, now.startOf('month')) &&
              isBeforeOrEqual(parsed, now.endOf('month'))
          );
        }

        if (method === 'this-quarter') {
          return handleDateRangeFilter(
            o,
            parsed =>
              isAfterOrEqual(parsed, now.startOf('quarter')) &&
              isBeforeOrEqual(parsed, now.endOf('quarter'))
          );
        }

        if (method === 'this-year') {
          return handleDateRangeFilter(
            o,
            parsed =>
              isAfterOrEqual(parsed, now.startOf('year')) &&
              isBeforeOrEqual(parsed, now.endOf('year'))
          );
        }

        throw new Error(`Unsupported method: ${method}`);
      })
    );
  };
}

function parseDate(value: string | number): [number, number, number] | null {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }
    const [_, year, month, day] = match;
    return [parseInt(year), parseInt(month), parseInt(day)];
  } else if (typeof value === 'number') {
    const date = new Date(value);
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
  }
  return null;
}

function handleDateRangeFilter(
  propertyValues: Map<string, string | number | undefined>,
  predicate: (parsed: [number, number, number]) => boolean
): Set<string> {
  const match = new Set<string>();
  for (const [id, value] of propertyValues) {
    if (!value) {
      continue;
    }
    const parsed = parseDate(value);
    if (parsed && predicate(parsed)) {
      match.add(id);
    }
  }
  return match;
}

// FIX: Tách riêng isAfter (strictly after, dùng cho 'after' method)
function isAfter(
  targetDate: readonly [number, number, number] | Dayjs,
  referenceDate: readonly [number, number, number] | Dayjs
): boolean {
  const [targetYear, targetMonth, targetDay] = isDayjs(targetDate)
    ? [targetDate.year(), targetDate.month() + 1, targetDate.date()]
    : targetDate;
  const [refYear, refMonth, refDay] = isDayjs(referenceDate)
    ? [referenceDate.year(), referenceDate.month() + 1, referenceDate.date()]
    : referenceDate;

  return (
    targetYear > refYear ||
    (targetYear === refYear && targetMonth > refMonth) ||
    (targetYear === refYear && targetMonth === refMonth && targetDay > refDay) // FIX: Đổi >= thành >
  );
}

// NEW: Thêm isAfterOrEqual (dùng cho ranges)
function isAfterOrEqual(
  targetDate: readonly [number, number, number] | Dayjs,
  referenceDate: readonly [number, number, number] | Dayjs
): boolean {
  const [targetYear, targetMonth, targetDay] = isDayjs(targetDate)
    ? [targetDate.year(), targetDate.month() + 1, targetDate.date()]
    : targetDate;
  const [refYear, refMonth, refDay] = isDayjs(referenceDate)
    ? [referenceDate.year(), referenceDate.month() + 1, referenceDate.date()]
    : referenceDate;

  return (
    targetYear > refYear ||
    (targetYear === refYear && targetMonth > refMonth) ||
    (targetYear === refYear && targetMonth === refMonth && targetDay >= refDay)
  );
}

// FIX: isBefore đổi thành strictly before
function isBefore(
  targetDate: readonly [number, number, number] | Dayjs,
  referenceDate: readonly [number, number, number] | Dayjs
): boolean {
  const [targetYear, targetMonth, targetDay] = isDayjs(targetDate)
    ? [targetDate.year(), targetDate.month() + 1, targetDate.date()]
    : targetDate;
  const [refYear, refMonth, refDay] = isDayjs(referenceDate)
    ? [referenceDate.year(), referenceDate.month() + 1, referenceDate.date()]
    : referenceDate;

  return (
    targetYear < refYear ||
    (targetYear === refYear && targetMonth < refMonth) ||
    (targetYear === refYear && targetMonth === refMonth && targetDay < refDay) // FIX: Đổi <= thành <
  );
}

// NEW: Thêm isBeforeOrEqual
function isBeforeOrEqual(
  targetDate: readonly [number, number, number] | Dayjs,
  referenceDate: readonly [number, number, number] | Dayjs
): boolean {
  const [targetYear, targetMonth, targetDay] = isDayjs(targetDate)
    ? [targetDate.year(), targetDate.month() + 1, targetDate.date()]
    : targetDate;
  const [refYear, refMonth, refDay] = isDayjs(referenceDate)
    ? [referenceDate.year(), referenceDate.month() + 1, referenceDate.date()]
    : referenceDate;

  return (
    targetYear < refYear ||
    (targetYear === refYear && targetMonth < refMonth) ||
    (targetYear === refYear && targetMonth === refMonth && targetDay <= refDay)
  );
}
