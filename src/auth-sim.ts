/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserSession } from './types';

// Simple, robust client-side storage of user sessions to simulate persistent Firebase Auth
const SESSION_KEY = 'portal_gestao_session';
const USERS_DB_KEY = 'portal_gestao_users';

export const DEFAULT_USERS = [
  {
    email: 'admin@portal.com',
    password: 'admin123',
    displayName: 'Administrador Geral',
    role: 'admin' as const,
  },
  {
    email: 'editor@portal.com',
    password: 'editor123',
    displayName: 'Editor de Contratos',
    role: 'editor' as const,
  },
  {
    email: 'cliente@portal.com',
    password: 'cliente123',
    displayName: 'Cliente Demo (SEDUC)',
    role: 'cliente' as const,
    secretarias: ['SEDUC - Secretaria de Educação']
  }
];

export function getStoredSession(): UserSession | null {
  try {
    const data = sessionStorage.getItem(SESSION_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: UserSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.error('Failed to save session:', e);
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (e) {
    console.error('Failed to clear session:', e);
  }
}

export function getRegisteredUsers() {
  try {
    const data = localStorage.getItem(USERS_DB_KEY);
    if (!data) {
      localStorage.setItem(USERS_DB_KEY, JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS;
    }
    return JSON.parse(data);
  } catch {
    return DEFAULT_USERS;
  }
}

export function registerUser(email: string, password: string, displayName: string, role: 'admin' | 'editor' | 'cliente' = 'admin', secretarias: string[] = []) {
  const users = getRegisteredUsers();
  if (users.some((u: any) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('Este e-mail já está cadastrado no sistema.');
  }

  const newUser = { email, password, displayName, role, secretarias };
  users.push(newUser);
  localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
  return newUser;
}
