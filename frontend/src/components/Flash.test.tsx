import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Flash } from './Flash';

describe('Flash', () => {
  it('[ENF-UTI-03] announces an error immediately, as an alert', () => {
    render(<Flash>API injoignable : vérifiez que le serveur Tracandi est démarré.</Flash>);

    expect(screen.getByRole('alert')).toHaveTextContent('API injoignable');
  });

  it('[ENF-UTI-03] confirms a completed action politely, without interrupting the user', () => {
    render(<Flash tone="success">Candidature ajoutée.</Flash>);

    const message = screen.getByRole('status');
    expect(message).toHaveTextContent('Candidature ajoutée.');
    expect(message).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
