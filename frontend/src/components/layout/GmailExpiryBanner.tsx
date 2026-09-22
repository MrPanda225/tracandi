import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { fetchGmailStatus } from '../../api/gmail';

const SETTINGS_PATH = '/reglages';

/**
 * Q-11: once Google refused the Gmail authorisation (7 days in test mode), every screen asks to reconnect; the
 * settings screen shows its own message with the reconnection button.
 */
export function GmailExpiryBanner() {
  const { pathname } = useLocation();
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchGmailStatus(controller.signal)
      .then((gmail) => setIsExpired(gmail.connected && gmail.authorizationExpired))
      // A background check: the settings screen reports a failure to read the connection.
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (!isExpired || pathname === SETTINGS_PATH) return null;
  return (
    <p role="alert" className="flash flash--error shell__banner">
      L’autorisation Gmail a expiré : la synchronisation est en pause. <Link to={SETTINGS_PATH}>Reconnecter Gmail</Link>
    </p>
  );
}
