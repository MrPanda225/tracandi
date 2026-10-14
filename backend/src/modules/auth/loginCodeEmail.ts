const LOGIN_CODE_LIFETIME_MINUTES = 10;

export interface LoginCodeEmailContent {
  subject: string;
  html: string;
}

/**
 * French login-code e-mail (ENF-UTI-01): the six-digit code, its validity, and a warning for whoever did not try to
 * log in. Composed from the code alone — never the password nor any other account datum (ENF-RGP-15).
 * @req EF-AUT-16, ENF-RGP-15
 */
export const buildLoginCodeEmail = ({ code }: { code: string }): LoginCodeEmailContent => ({
  subject: 'Votre code de connexion Tracandi',
  html:
    '<p>Bonjour,</p>' +
    '<p>Voici votre code de connexion à Tracandi :</p>' +
    `<p style="font-size:28px;letter-spacing:6px"><strong>${code}</strong></p>` +
    `<p>Il est valable ${String(LOGIN_CODE_LIFETIME_MINUTES)} minutes et ne peut servir qu'à une seule connexion.</p>` +
    "<p>Si ce n'est pas vous qui vous connectez, ignorez ce message et changez votre mot de passe sans attendre.</p>",
});
