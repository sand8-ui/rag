import dayjs, { type Dayjs } from 'dayjs';

export function disablePastDate(current: Dayjs) {
  return current.isBefore(dayjs(), 'day');
}
