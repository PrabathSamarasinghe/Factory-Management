import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { FinanceScreen } from '../src/screens/FinanceScreen';

jest.mock('../src/hooks/useCachedResource', () => ({
  useCachedResource: () => ({
    data: { grossValue: 1000 },
    loading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

test('finance locked without permission', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <FinanceScreen online={true} canViewFinance={false} />,
    );
  });
  const out = renderer.root
    .findAll(n => (n.type as unknown) === 'Text')
    .flatMap(n => n.props.children)
    .join(' ');
  expect(out).toContain('Access locked');
  expect(out).toContain('monitor:finance');
});
