export const GOOGLE_SCOPES =
  'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

let cached: { token: string; expiresAt: number } | null = null;

function gisReady(): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (window.google?.accounts?.oauth2) return resolve();
      if (Date.now() - start > 10000) {
        return reject(new GoogleAuthError('Google Identity Services failed to load. Check your network or ad blocker.'));
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}

/**
 * Get an access token for the Sheets + Drive scopes, prompting the user through
 * the GIS popup when we do not already hold a live one.
 */
export async function getAccessToken(clientId: string, forcePrompt = false): Promise<string> {
  if (!clientId) {
    throw new GoogleAuthError(
      'No Google OAuth Client ID configured. Set VITE_GOOGLE_CLIENT_ID or paste a Client ID in Profile & Settings.',
    );
  }
  if (!forcePrompt && cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  await gisReady();

  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES,
      callback: (response) => {
        if (response.error || !response.access_token) {
          cached = null;
          reject(
            new GoogleAuthError(
              response.error_description || response.error || 'Google sign-in was cancelled.',
            ),
          );
          return;
        }
        cached = {
          token: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
        };
        resolve(response.access_token);
      },
      error_callback: (error) => {
        cached = null;
        reject(new GoogleAuthError(error.message || 'Google sign-in popup was closed or blocked.'));
      },
    });
    client.requestAccessToken({ prompt: cached ? '' : 'consent' });
  });
}

export function hasLiveToken(): boolean {
  return !!cached && cached.expiresAt > Date.now() + 60_000;
}

export function signOut(): void {
  if (cached && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(cached.token);
  cached = null;
}

/** Drop the cached token so the next call re-prompts (used after a 401 from Sheets). */
export function invalidateToken(): void {
  cached = null;
}
