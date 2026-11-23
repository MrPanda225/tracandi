import { describe, expect, it } from 'vitest';
import { companyKey, jobTitleKey } from './text.js';

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

describe('jobTitleKey (RG-25)', () => {
  it.each([
    ['Data Analyst', 'data analyst'],
    ['Data Analyst H/F', 'data analyst'],
    ['Data analyst (F/H) - CDI', 'data analyst'],
    ['Data analyst - Stage', 'data analyst'],
    ['Data analyst réf. 4521', 'data analyst'],
    ['Data analyst n°12 (H)', 'data analyst'],
    ['Développeur F', 'developpeur'],
    ['Chef de projet Lot 2', 'chef de projet lot 2'],
    ['Alternance', 'alternance'],
  ])('[RG-25] gives « %s » the key « %s »', (title, key) => {
    expect(jobTitleKey(title)).toBe(key);
  });
});
