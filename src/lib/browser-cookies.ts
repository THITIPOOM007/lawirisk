import 'client-only';
import { useSyncExternalStore } from 'react';

export function readBrowserCookie(name: string) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((item) => item.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

export function writeDemoAuthCookies(role: string, name: string) {
  const cookieOptions = 'Max-Age=28800; path=/; SameSite=Lax';
  document.cookie = `mock-auth-logged-in=true; ${cookieOptions}`;
  document.cookie = `mock-auth-role=${role}; ${cookieOptions}`;
  document.cookie = `mock-auth-name=${encodeURIComponent(name)}; ${cookieOptions}`;
  window.dispatchEvent(new Event('ev-auth-change'));
}

const subscribeToAuth = (onStoreChange: () => void) => {
  window.addEventListener('ev-auth-change', onStoreChange);
  return () => window.removeEventListener('ev-auth-change', onStoreChange);
};

export function useDemoRole() {
  return useSyncExternalStore(
    subscribeToAuth,
    () => readBrowserCookie('mock-auth-role') || 'VIEWER',
    () => 'VIEWER',
  );
}
