import { useState } from 'react';
import { Link } from 'react-router-dom';
import './CookieNotice.css';

// Read by this browser only; nothing leaves it (ENF-RGP-04).
const READ_KEY = 'tracandi.cookie-notice-read';

const hasBeenRead = (): boolean => {
  try {
    return window.localStorage.getItem(READ_KEY) === '1';
  } catch {
    // Storage refused (private window, blocked site data): the notice shows, and simply closes for this visit.
    return false;
  }
};

/**
 * EF-LEG-02: tells, on the first visit, that the only cookie is the session one. Information, not a request:
 * nothing to accept nor refuse (CNIL guidelines on strictly necessary cookies), and it never blocks the page.
 */
export function CookieNotice() {
  const [isOpen, setIsOpen] = useState(() => !hasBeenRead());

  const handleRead = () => {
    setIsOpen(false);
    try {
      window.localStorage.setItem(READ_KEY, '1');
    } catch {
      // Same as above: nothing more to do than close it.
    }
  };

  if (!isOpen) return null;
  return (
    <section className="cookie-notice" aria-label="Information sur les cookies">
      <p>
        Tracandi n’utilise qu’un seul cookie, nécessaire pour vous garder connecté : ni mesure d’audience, ni publicité.{' '}
        <Link to="/cookies">En savoir plus</Link>
      </p>
      <button type="button" className="btn btn--small" onClick={handleRead}>
        Compris
      </button>
    </section>
  );
}
