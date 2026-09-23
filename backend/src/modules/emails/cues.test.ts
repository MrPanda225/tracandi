import { describe, expect, it } from 'vitest';
import type { ClassifiedMessage } from './classification.js';
import { applyRejectionCue, hasRejectionCue } from './cues.js';

const classified = (category: ClassifiedMessage['category']): ClassifiedMessage => ({
  ref: 1,
  category,
  employer: 'Maison Lumen',
  platform: null,
  jobTitle: 'UX designer',
  contractType: null,
});

const message = (subject: string, snippet: string, direction: 'inbound' | 'outbound' = 'inbound') => ({
  direction,
  subject,
  snippet,
});

describe('hasRejectionCue', () => {
  it.each([
    ['nous ne donnons pas suite', 'Nous ne donnons pas suite à votre candidature.'],
    ['candidature non retenue', 'Votre candidature n’a pas été retenue pour ce poste.'],
    ['profil non retenu', 'Nous vous informons que votre profil n’a pas été retenu.'],
    ['regret', 'Nous avons le regret de vous informer que nous poursuivons avec un autre profil.'],
    ['profil différent', 'Votre profil ne correspond pas au profil recherché pour ce poste.'],
    ['poste pourvu', 'Le poste a été pourvu entre-temps, merci de votre intérêt.'],
    ['processus arrêté', 'Nous avons décidé de ne pas poursuivre le processus de recrutement avec vous.'],
    ['anglais', 'We regret to inform you that you have not been selected for this role.'],
  ])('[RG-17] recognises a refusal by its wording (%s)', (_case, snippet) => {
    expect(hasRejectionCue({ subject: null, snippet })).toBe(true);
  });

  it.each([
    ['accusé de réception', 'Nous avons bien reçu votre candidature et revenons vers vous sous 15 jours.'],
    ['candidature retenue', 'Bonne nouvelle : votre candidature a été retenue pour la suite du processus.'],
    [
      'invitation',
      'Nous souhaitons vous rencontrer : quelles sont vos disponibilités la semaine prochaine ?',
    ],
    ['alerte emploi', 'Cinq nouvelles offres correspondent à votre recherche de data analyst à Lyon.'],
  ])('[RG-17] leaves a message without any refusal wording alone (%s)', (_case, snippet) => {
    expect(hasRejectionCue({ subject: null, snippet })).toBe(false);
  });

  it('[RG-17] reads the subject as well as the excerpt', () => {
    expect(hasRejectionCue({ subject: 'Votre candidature non retenue', snippet: 'Bonjour Alex,' })).toBe(
      true,
    );
  });

  it('[RG-17] ignores case, accents and punctuation', () => {
    expect(hasRejectionCue({ subject: null, snippet: 'NOUS NE DONNONS PAS SUITE.' })).toBe(true);
    expect(hasRejectionCue({ subject: null, snippet: 'n’a pas ete retenue' })).toBe(true);
  });
});

describe('applyRejectionCue', () => {
  it('[RG-17] files a polite refusal opened by an acknowledgement as a refusal', () => {
    const polite = message(
      'Votre candidature chez Maison Lumen',
      'Nous avons bien reçu votre candidature au poste d’UX designer. Toutefois, nous ne donnons pas suite.',
    );

    expect(applyRejectionCue(polite, classified('acknowledged')).category).toBe('rejected');
  });

  it('[RG-17] leaves an acknowledgement without any refusal wording alone', () => {
    const acknowledgement = message(
      'Nous avons bien reçu votre candidature',
      'Merci pour votre candidature, nous revenons vers vous sous 15 jours.',
    );

    expect(applyRejectionCue(acknowledgement, classified('acknowledged'))).toEqual(
      classified('acknowledged'),
    );
  });

  it('[RG-17] never replaces a job offer the AI recognised', () => {
    const offer = message(
      'Proposition d’embauche',
      'Nous avons le plaisir de vous proposer le poste ; nous ne donnons pas suite aux autres candidatures.',
    );

    expect(applyRejectionCue(offer, classified('offer')).category).toBe('offer');
  });

  it('[RG-17] never corrects a message the candidate sent', () => {
    const sent = message(
      'Relance de ma candidature',
      'Vous m’avez indiqué ne pas donner suite ; je me permets de vous proposer ma candidature pour un autre poste.',
      'outbound',
    );

    expect(applyRejectionCue(sent, classified('sent_application')).category).toBe('sent_application');
  });

  it('[RG-17] corrects a refusal the AI took for an interview or for an off-topic message', () => {
    const refusal = message(
      'Suite à votre entretien',
      'Votre candidature n’a pas été retenue à l’issue de nos échanges.',
    );

    expect(applyRejectionCue(refusal, classified('interview')).category).toBe('rejected');
    expect(applyRejectionCue(refusal, classified('off_topic')).category).toBe('rejected');
  });

  it('[RG-17] keeps every other field of the classification', () => {
    const refusal = message('Votre candidature', 'Nous ne donnons pas suite.');

    expect(applyRejectionCue(refusal, classified('acknowledged'))).toEqual({
      ...classified('acknowledged'),
      category: 'rejected',
    });
  });
});
