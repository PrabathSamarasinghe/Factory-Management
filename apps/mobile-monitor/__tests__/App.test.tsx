import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { LoginScreen } from '../src/screens/LoginScreen';

jest.mock('../src/storage/appStorage', () => ({
  getApiBaseUrl: jest.fn(async () => 'http://localhost:3000/api/v1'),
  getDeviceId: jest.fn(async () => 'device-1'),
  setApiBaseUrl: jest.fn(async () => undefined),
}));

jest.mock('../src/api/client', () => ({
  signIn: jest.fn(async () => undefined),
}));

function text(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAll(n => (n.type as unknown) === 'Text')
    .flatMap(n => n.props.children)
    .join(' ');
}

test('renders login screen initially', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <LoginScreen onSignedIn={() => undefined} />,
    );
  });
  const out = text(renderer);
  expect(out).toContain('Galatura Monitor');
  expect(out).toContain('Sign in');
});
