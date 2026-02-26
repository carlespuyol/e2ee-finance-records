// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';

// Helper: render a component that calls useAuth and displays auth state
function AuthDisplay() {
  const { auth, setAuth, logout } = useAuth();
  return (
    <div>
      <span data-testid="email">{auth?.user.email ?? 'none'}</span>
      <button onClick={() => setAuth({
        token: 'test-token',
        user: { id: 1, email: 'user@example.com' },
        cryptoKey: {} as CryptoKey, // minimal mock for display test
      })}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  it('1. useAuth() outside AuthProvider throws an error', () => {
    // Suppress React error boundary noise in test output
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<AuthDisplay />)).toThrow(/useAuth must be used within AuthProvider/i);
    consoleError.mockRestore();
  });

  it('2. setAuth stores token, user, and cryptoKey in React state', async () => {
    render(<AuthProvider><AuthDisplay /></AuthProvider>);

    expect(screen.getByTestId('email').textContent).toBe('none');

    await act(async () => {
      screen.getByText('login').click();
    });

    expect(screen.getByTestId('email').textContent).toBe('user@example.com');
  });

  it('3. logout() sets auth to null', async () => {
    render(<AuthProvider><AuthDisplay /></AuthProvider>);

    // Login first
    await act(async () => { screen.getByText('login').click(); });
    expect(screen.getByTestId('email').textContent).toBe('user@example.com');

    // Logout
    await act(async () => { screen.getByText('logout').click(); });
    expect(screen.getByTestId('email').textContent).toBe('none');
  });

  it('4. localStorage.setItem is NEVER called — JWT not persisted', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem');

    render(<AuthProvider><AuthDisplay /></AuthProvider>);
    await act(async () => { screen.getByText('login').click(); });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

});
