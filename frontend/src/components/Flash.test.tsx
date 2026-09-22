import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Flash } from './Flash';

describe('Flash', () => {
  it('[ENF-UTI-03] announces an error immediately, as an alert', () => {
    render(<Flash>API injoignable : vérifiez que le serveur Tracandi est démarré.</Flash>);

    expect(screen.getByRole('alert')).toHaveTextContent('API injoignable');
  });
});
