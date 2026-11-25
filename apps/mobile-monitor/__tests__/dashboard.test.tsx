import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { TodayScreen } from '../src/screens/TodayScreen';

jest.mock('../src/hooks/useCachedResource', () => ({
  useCachedResource: () => ({
    data: {
      date: '2026-11-24',
      attendance: { present: 12, absent: 2, late: 1 },
      collections: { totalKg: 5400, suppliers: 33 },
      trips: { active: 3, completed: 5 },
      alerts: 1,
    },
    loading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

test('dashboard renders aggregate response', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<TodayScreen online={true} />);
  });
  const out = renderer.root
    .findAll(n => (n.type as unknown) === 'Text')
    .flatMap(n => n.props.children)
    .join(' ');
  expect(out).toContain('5400');
  expect(out).toContain('Present');
  expect(out).toContain('Alerts');
});
