const ACTIVATION_PATH = '/activation';
const ACTIVATION_TOKEN_LIFETIME_MINUTES = 15;

export interface ActivationEmailContent {
  subject: string;
  html: string;
}

/**
 * French activation e-mail (ENF-UTI-01): a single link carrying the token as its `code` query parameter, consumed
 * automatically when the candidate opens it (ROADMAP T-1019, `/activation?code=…`). Composed from the token and the
 * interface's own origin only — never the password nor any other account datum (ENF-RGP-15).
 * @req EF-AUT-14, ENF-RGP-15
 */
export const buildActivationEmail = ({
  frontendOrigin,
  token,
}: {
  frontendOrigin: string;
  token: string;
}): ActivationEmailContent => {
  const link = `${frontendOrigin}${ACTIVATION_PATH}?code=${encodeURIComponent(token)}`;
  return {
    subject: 'Activez votre compte Tracandi',
    html:
      '<p>Bonjour,</p>' +
      `<p>Pour activer votre compte Tracandi, ouvrez ce lien dans les ${String(ACTIVATION_TOKEN_LIFETIME_MINUTES)} minutes :</p>` +
      `<p><a href="${link}">${link}</a></p>` +
      '<p>Passé ce délai, vous pourrez demander un nouvel envoi depuis la page de connexion.</p>' +
      "<p>Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement ce message.</p>",
  };
};
