import { describe, expect, it } from 'vitest';
import { companyKey } from './text.js';

describe('companyKey (RG-26)', () => {
  it.each([
    ['Capgemini', 'capgemini'],
    ['CAPGEMINI SE', 'capgemini'],
    ['Capgemini France', 'capgemini'],
    ['Capgemini France SAS', 'capgemini'],
    ['Société Générale', 'societe generale'],
    ['Groupe', 'groupe'],
  ])('[RG-26] gives « %s » the key « %s »', (name, key) => {
    expect(companyKey(name)).toBe(key);
  });
});
