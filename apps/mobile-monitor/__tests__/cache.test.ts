import '../jest.setup.js';
import { cacheLastView, readLastView } from '@galatura/mobile-core';

test('cached last view renders while offline', async () => {
  await cacheLastView('monitor.today', {
    date: '2026-11-24',
    alerts: 2,
    attendance: { present: 1, absent: 2, late: 3 },
    collections: { totalKg: 10, suppliers: 1 },
    trips: { active: 1, completed: 0 },
  });
  const value = await readLastView<any>('monitor.today');
  expect(value.alerts).toBe(2);
  expect(value.attendance.present).toBe(1);
});
