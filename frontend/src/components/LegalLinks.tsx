import { Link } from 'react-router-dom';
import './LegalLinks.css';

/** EF-LEG-01: the three legal pages, linked from every public page and from the application. */
export function LegalLinks({ className = 'legal-links' }: { className?: string }) {
  return (
    <nav className={className} aria-label="Informations légales">
      <Link to="/mentions-legales">Mentions légales</Link>
      <Link to="/confidentialite">Confidentialité</Link>
      <Link to="/cookies">Cookies</Link>
    </nav>
  );
}
