// The Gmail entry point only: the whole googleapis index describes every Google API and exhausts the typed lint.
import { auth, gmail } from 'googleapis/build/src/apis/gmail/index.js';

/** ENF-SEC-07: the only scope asked: read messages and set labels, never send nor delete. */
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

/** The candidate refused, or unticked the Gmail permission on Google's consent screen. */
export class GmailAccessRefusedError extends Error {
  constructor() {
    super('Gmail access was not granted');
    this.name = 'GmailAccessRefusedError';
  }
}

/** Google's side of the Gmail connection, injected so that tests never call Google. */
export interface GoogleOAuth {
  /** Consent page URL for the gmail.modify scope, lasting access, carrying the given state. */
  authorizationUrl: (state: string) => string;
  /**
   * Exchanges the authorization code for a refresh token and reads the address of the authorized mailbox.
   * @throws GmailAccessRefusedError when the gmail.modify scope was not granted; any other error on a Google failure.
   */
  exchangeCode: (code: string) => Promise<{ refreshToken: string; emailAddress: string }>;
  /** Revokes the refresh token at Google (EF-GML-02). */
  revoke: (refreshToken: string) => Promise<void>;
}

interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Google OAuth on the real API (googleapis), with the client of the configuration.
 * @req EF-GML-01, EF-GML-02, ENF-SEC-07
 */
export const connectGoogleOAuth = ({
  clientId,
  clientSecret,
  redirectUri,
}: GoogleOAuthConfig): GoogleOAuth => {
  const newClient = () => new auth.OAuth2(clientId, clientSecret, redirectUri);

  return {
    authorizationUrl: (state) =>
      newClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: [GMAIL_SCOPE], state }),

    async exchangeCode(code) {
      const client = newClient();
      const { tokens } = await client.getToken(code);
      // Google's granular consent lets the user untick the scope: without it the connection is useless.
      if (!tokens.scope?.split(' ').includes(GMAIL_SCOPE)) throw new GmailAccessRefusedError();
      if (!tokens.refresh_token) throw new Error('Google returned no refresh token');
      client.setCredentials(tokens);
      const profile = await gmail({ version: 'v1', auth: client }).users.getProfile({ userId: 'me' });
      if (!profile.data.emailAddress) throw new Error('Gmail profile without address');
      return { refreshToken: tokens.refresh_token, emailAddress: profile.data.emailAddress };
    },

    async revoke(refreshToken) {
      await newClient().revokeToken(refreshToken);
    },
  };
};
