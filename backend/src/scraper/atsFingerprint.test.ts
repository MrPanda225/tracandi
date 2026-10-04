import { describe, expect, it } from 'vitest';
import { detectSource } from './atsFingerprint.js';

const page = (...snippets: string[]): string => `<html><body>${snippets.join('\n')}</body></html>`;

describe('recruiting software of a page (RG-27)', () => {
  it.each([
    ['<a href="https://job-boards.greenhouse.io/acme">Jobs</a>', 'greenhouse', 'acme'],
    [
      '<script src="https://boards.greenhouse.io/embed/job_board/js?for=acme"></script>',
      'greenhouse',
      'acme',
    ],
    ['<a href="https://jobs.lever.co/acme/123">Poste</a>', 'lever', 'acme'],
    ['<a href="https://careers.smartrecruiters.com/Acme1">Offres</a>', 'smartrecruiters', 'acme1'],
    ['<iframe src="https://acme.recruitee.com/o/data"></iframe>', 'recruitee', 'acme'],
    [
      '<a href="https://acme.wd3.myworkdayjobs.com/fr-FR/Carrieres/job/1">x</a>',
      'workday',
      'https://acme.wd3.myworkdayjobs.com/Carrieres',
    ],
    [
      '<a href="https://acme-career.talent-soft.com/offre-de-emploi/liste.aspx">x</a>',
      'talentsoft',
      'acme-career',
    ],
    ['<a href="https://acme.teamtailor.com/jobs">x</a>', 'teamtailor', 'acme'],
    ['<a href="https://acme.jobs.personio.de/">x</a>', 'personio', 'acme'],
    ['<a href="https://apply.workable.com/acme/">x</a>', 'workable', 'acme'],
    ['<a href="https://jobs.ashbyhq.com/Acme">x</a>', 'ashby', 'Acme'],
    [
      '<a href="https://careers.flatchr.io/fr/company/acme/">x</a>',
      'generic',
      'https://careers.flatchr.io/fr/company/acme/',
    ],
    ['<script>window.cfg = {"board":"//jobs.lever.co/acme"}</script>', 'lever', 'acme'],
  ])('[RG-27] reads %s', (snippet, adapter, identifier) => {
    expect(detectSource(page(snippet))).toEqual({ adapter, identifier });
  });

  it('[RG-27] never takes a technical sub-domain, nor the editor’s own career site, for a customer', () => {
    expect(
      detectSource(
        page(
          '<script src="https://assets.teamtailor.com/x.js"></script>',
          '<a href="https://career.teamtailor.com/">x</a>',
        ),
      ),
    ).toBeNull();
  });

  it('[RG-27] keeps the software the page cites most', () => {
    const html = page(
      '<a href="https://jobs.lever.co/old">x</a>',
      '<a href="https://jobs.ashbyhq.com/Acme/1">x</a>',
      '<a href="https://jobs.ashbyhq.com/Acme/2">x</a>',
    );

    expect(detectSource(html)).toEqual({ adapter: 'ashby', identifier: 'Acme' });
  });

  it('[RG-27] finds nothing on a page that cites no recruiting software', () => {
    expect(detectSource(page('<a href="https://exemple.fr/contact">Contact</a>'))).toBeNull();
  });
});
