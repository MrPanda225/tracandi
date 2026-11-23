import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ApplicationStatus } from '../api/stats';
import { FollowUpDueTag, StatusTag, statusColorVar } from './StatusTag';

const EXPECTED: [ApplicationStatus, string, string][] = [
  ['to_apply', 'À postuler', 'to-apply'],
  ['sent', 'Envoyée', 'in-progress'],
  ['acknowledged', 'Accusé reçu', 'in-progress'],
  ['technical_test', 'Test technique', 'in-progress'],
  ['interview', 'Entretien', 'in-progress'],
  ['offer', 'Proposition', 'offer'],
  ['rejected', 'Refusée', 'rejected'],
];

describe('StatusTag', () => {
  it.each(EXPECTED)('[EF-CAN-22] shows %s with its label and its colour', (status, label, tone) => {
    render(<StatusTag status={status} />);

    expect(screen.getByText(label)).toHaveClass('status-tag', `status-tag--${tone}`);
  });

  it('[EF-CAN-22] colours the status bars of the charts like the tags', () => {
    expect(statusColorVar('to_apply')).toBe('var(--application-to-apply)');
    expect(statusColorVar('interview')).toBe('var(--application-in-progress)');
    expect(statusColorVar('rejected')).toBe('var(--application-rejected)');
  });
});

describe('FollowUpDueTag', () => {
  it('[EF-CAN-22] marks « À relancer » (RG-06) in dark red, with its label', () => {
    render(<FollowUpDueTag />);

    expect(screen.getByText('À relancer')).toHaveClass('status-tag', 'status-tag--no-reply');
  });
});
