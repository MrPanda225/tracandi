import { describe, expect, it } from 'vitest';
import { connectGoogleOAuth, GMAIL_SCOPE } from './googleOAuth.js';

const oauth = connectGoogleOAuth({
  clientId: 'test-client.apps.googleusercontent.com',
  clientSecret: 'test-secret',
  redirectUri: 'http://localhost:4000/api/gmail/callback',
});

describe('Google OAuth adapter', () => {
  it('[ENF-SEC-07] asks for the gmail.modify scope only', () => {
    const url = new URL(oauth.authorizationUrl('state-value'));

    expect(url.searchParams.get('scope')).toBe(GMAIL_SCOPE);
    expect(GMAIL_SCOPE).toBe('https://www.googleapis.com/auth/gmail.modify');
    expect(url.searchParams.get('include_granted_scopes')).not.toBe('true');
  });

  it('[EF-GML-01] [ENF-SEC-14] asks for a lasting access, with consent, the issued state and the configured return address', () => {
    const url = new URL(oauth.authorizationUrl('state-value'));

    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('state-value');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:4000/api/gmail/callback');
    expect(url.searchParams.get('client_id')).toBe('test-client.apps.googleusercontent.com');
    expect(url.searchParams.get('response_type')).toBe('code');
  });
});
