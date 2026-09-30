import { describe, expect, it } from 'vitest';
import type { ClassifiedMessage } from './classification.js';
import { applyCategoryCues, hasAcknowledgementCue, hasRejectionCue } from './cues.js';

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
    ['pas retenue', 'Votre candidature n’a pas retenue notre attention pour ce poste.'],
    ['pas été retenue', 'Votre candidature n’a pas été retenue pour ce poste.'],
    ['ne correspond malheureusement pas', 'Votre profil ne correspond malheureusement pas à nos attentes.'],
    ['au regret', 'Nous sommes au regret de vous informer que nous poursuivons avec un autre profil.'],
    ['suite favorable niée', 'Nous ne pouvons donner une suite favorable à votre candidature.'],
    [
      'nous ne pouvons y donner',
      'Votre dossier a retenu notre attention mais nous ne pouvons y donner suite.',
    ],
    ['ne donnons pas suite', 'Après étude, nous ne donnons pas suite.'],
    ['autre candidat', 'Nous avons retenu un autre candidat dont le profil était plus proche du poste.'],
    ['poste pourvu', 'Le poste a été pourvu entre-temps, merci de votre intérêt.'],
    ['processus arrêté', 'Nous avons décidé de ne pas poursuivre le processus de recrutement avec vous.'],
    ['anglais — regret', 'We regret to inform you that you have not been selected for this role.'],
    ['anglais — moving forward', 'We will not be moving forward with your application at this time.'],
    ['anglais — unsuccessful', 'Your application was unsuccessful on this occasion.'],
    ['anglais — another candidate', 'We have decided to proceed with another candidate.'],
    ['anglais — filled', 'The position has been filled, thank you for your interest.'],
    ['autre candidature privilégiée', 'Nous avons privilégié une autre candidature pour ce poste.'],
    ['regrets de ne pas', 'Nous regrettons de ne pas pouvoir poursuivre avec vous.'],
    ['anglais — other candidates', 'We have decided to move forward with other candidates.'],
    ['refus au passé', 'Lorsque nous avons étudié votre dossier, nous avons décidé de ne pas donner suite.'],
    ['anglais — position closed', 'The position is no longer available, thank you for your interest.'],
  ])('[RG-17] recognises a refusal by its wording (%s)', (_case, snippet) => {
    expect(hasRejectionCue({ subject: null, snippet })).toBe(true);
  });

  it.each([
    ['accusé de réception', 'Nous avons bien reçu votre candidature et revenons vers vous sous 15 jours.'],
    ['candidature retenue', 'Bonne nouvelle : votre candidature a été retenue pour la suite du processus.'],
    [
      'suite favorable donnée',
      'Nous donnons une suite favorable à votre candidature et souhaitons vous voir.',
    ],
    [
      'invitation',
      'Nous souhaitons vous rencontrer : quelles sont vos disponibilités la semaine prochaine ?',
    ],
    ['alerte emploi', 'Cinq nouvelles offres correspondent à votre recherche de data analyst à Lyon.'],
    ['anglais — positif', 'We are moving forward with your application and would like to meet you.'],
    // Wordings reported in production (30/09/2026) that refuse nothing.
    ['condition « en cas de »', 'Nous ne manquerons pas de revenir vers vous en cas de suite favorable.'],
    ['condition « dès que »', 'Nous ne tarderons pas à revenir vers vous dès que nous serons en mesure de donner une réponse.'],
    ['« pas encore »', 'Nous ne sommes pas encore en mesure de donner une réponse, merci de votre patience.'],
    ['anglais — « not yet »', 'We are not yet moving forward with your application: the review is ongoing.'],
    ['autre candidature possible', 'Vous pouvez aussi déposer une autre candidature sur notre site carrières.'],
    ['autre candidat à recommander', 'Connaissez-vous un autre candidat ? Parrainez-le.'],
    ['comparaison aux autres', 'See how you compare to other candidates for this role.'],
    ['lien expiré', 'This link is no longer available, please sign in again.'],
    ['regret du délai', 'Nous regrettons le délai de réponse et étudions votre candidature.'],
    ['CV gardé pendant l’étude', 'Thank you for applying, we will keep your CV on file while we review it.'],
  ])('[RG-17] leaves a message without any refusal wording alone (%s)', (_case, snippet) => {
    expect(hasRejectionCue({ subject: null, snippet })).toBe(false);
  });

  it('[RG-17] reads the subject as well as the excerpt', () => {
    expect(hasRejectionCue({ subject: 'Votre candidature non retenue', snippet: 'Bonjour Alex,' })).toBe(
      true,
    );
  });

  it('[RG-17] [BES-30] reads the start of the body, where a refusal follows a long opening', () => {
    const opening = 'Nous vous remercions pour votre candidature au poste : Alternance Data analytics et IA H/F';
    expect(hasRejectionCue({ subject: null, snippet: opening })).toBe(false);
    expect(
      hasRejectionCue({
        subject: null,
        snippet: opening,
        text: `${opening}. Après étude, nous ne pouvons pas donner de suite favorable.`,
      }),
    ).toBe(true);
  });

  it.each([
    [
      'sans réponse sous 4 semaines',
      'Nous avons bien reçu votre candidature. Sans réponse de notre part sous 4 semaines, considérez que votre ' +
        'candidature n’a pas été retenue.',
    ],
    [
      'si le profil ne correspond pas',
      'Merci pour votre candidature. Si votre profil ne correspond pas à nos besoins, nous ne donnerons pas suite.',
    ],
    ['au cas où', 'Candidature bien reçue. Au cas où elle ne serait pas retenue, nous conserverons votre CV.'],
    [
      'anglais — conditionnel',
      'Thank you for applying. If you do not hear from us within 3 weeks, your application was unsuccessful.',
    ],
  ])('[RG-17] [BES-30] ignores a refusal announced only as a condition in an acknowledgement (%s)', (_case, text) => {
    expect(hasRejectionCue({ subject: null, snippet: '', text })).toBe(false);
    expect(hasAcknowledgementCue({ subject: null, snippet: '', text })).toBe(true);
  });

  it('[RG-17] [BES-30] still reads a refusal written after a conditional sentence', () => {
    const text =
      'Si vous avez des questions, écrivez-nous. Après étude, nous ne pouvons pas donner de suite favorable.';

    expect(hasRejectionCue({ subject: null, snippet: '', text })).toBe(true);
  });

  it('[RG-17] leaves an acknowledgement that warns of a silent refusal to come as an acknowledgement', () => {
    // Reported in production (30/09/2026), names changed: the refusal is only a possibility, after a delay.
    const text =
      'Vous venez de postuler à notre offre Data Engineer (F/H) - en alternance et nous vous remercions de l’intérêt ' +
      'que vous portez à notre entreprise. Nous allons, dans les meilleurs délais, étudier l’adéquation de votre ' +
      'profil avec notre besoin. Nous ne manquerons pas de vous recontacter par téléphone si votre profil correspond à ' +
      'notre recherche. Nous veillerons également à vous informer par écrit s’il n’était pas possible de donner une ' +
      'suite favorable à votre candidature. Néanmoins, sans nouvelles de notre part au cours des 5 prochaines semaines, ' +
      'vous pourrez considérer que votre candidature à ce poste n’a pas été retenue.';

    expect(hasRejectionCue({ subject: 'Maison Lumen : enregistrement de votre candidature', snippet: '', text })).toBe(false);
  });

  it.each([
    ['faute de réponse', 'Faute de réponse sous un mois, votre candidature ne sera pas retenue.'],
    ['considérez que', 'Passé ce délai, considérez que votre candidature n’a pas été retenue.'],
  ])('[RG-17] reads « %s » as a mere condition', (_case, snippet) => {
    expect(hasRejectionCue({ subject: null, snippet })).toBe(false);
  });

  it('[RG-17] ignores case, accents and punctuation', () => {
    expect(hasRejectionCue({ subject: null, snippet: 'NOUS NE DONNONS PAS SUITE.' })).toBe(true);
    expect(hasRejectionCue({ subject: null, snippet: 'n’a pas ete retenue' })).toBe(true);
  });
});

describe('hasAcknowledgementCue', () => {
  it.each([
    ['bien reçu votre candidature', 'Nous avons bien reçu votre candidature au poste de data analyst.'],
    ['accusé de réception', 'Accusé de réception de votre candidature — référence 4821.'],
    ['candidature a bien été', 'Votre candidature a bien été enregistrée par notre service recrutement.'],
    ['candidature prise en compte', 'Votre candidature est prise en compte, nous l’étudions avec attention.'],
    ['merci pour votre candidature', 'Merci pour votre candidature, nous reviendrons vers vous rapidement.'],
    ['anglais — received', 'We have received your application and will review it shortly.'],
    ['anglais — thank you', 'Thank you for applying to the data analyst position.'],
  ])('[RG-17] recognises an acknowledgement by its wording (%s)', (_case, snippet) => {
    expect(hasAcknowledgementCue({ subject: null, snippet })).toBe(true);
  });

  it('[RG-17] leaves a message without any acknowledgement wording alone', () => {
    expect(
      hasAcknowledgementCue({ subject: 'Entretien', snippet: 'Seriez-vous disponible mardi à 14 h ?' }),
    ).toBe(false);
  });
});

describe('applyCategoryCues — refusals', () => {
  it('[RG-17] files a polite refusal opened by an acknowledgement as a refusal', () => {
    const polite = message(
      'Votre candidature chez Maison Lumen',
      'Nous avons bien reçu votre candidature au poste d’UX designer. Toutefois, nous ne donnons pas suite.',
    );

    expect(applyCategoryCues(polite, classified('acknowledged')).category).toBe('rejected');
  });

  it('[RG-17] never replaces a job offer the AI recognised', () => {
    const offer = message(
      'Proposition d’embauche',
      'Nous avons le plaisir de vous proposer le poste ; nous ne donnons pas suite aux autres candidatures.',
    );

    expect(applyCategoryCues(offer, classified('offer')).category).toBe('offer');
  });

  it('[RG-17] never corrects a message the candidate sent', () => {
    const sent = message(
      'Relance de ma candidature',
      'Vous m’avez indiqué ne pas donner suite ; je vous propose ma candidature pour un autre poste.',
      'outbound',
    );

    expect(applyCategoryCues(sent, classified('sent_application')).category).toBe('sent_application');
  });

  it('[RG-17] corrects a refusal the AI took for an interview or for an off-topic message', () => {
    const refusal = message(
      'Suite à votre entretien',
      'Votre candidature n’a pas été retenue à l’issue de nos échanges.',
    );

    expect(applyCategoryCues(refusal, classified('interview')).category).toBe('rejected');
    expect(applyCategoryCues(refusal, classified('off_topic')).category).toBe('rejected');
  });

  it('[RG-17] never turns a job alert into a refusal, whatever an offer of the letter says', () => {
    const alert = message(
      'Les offres d’emploi de la semaine',
      'Data analyst à Lyon ; le poste de chargé de projet a été pourvu, cinq autres offres vous attendent.',
    );

    expect(applyCategoryCues(alert, classified('job_alert')).category).toBe('job_alert');
  });

  it('[RG-17] keeps every other field of the classification', () => {
    const refusal = message('Votre candidature', 'Nous ne donnons pas suite.');

    expect(applyCategoryCues(refusal, classified('acknowledged'))).toEqual({
      ...classified('acknowledged'),
      category: 'rejected',
    });
  });

  it('[RG-17] [BES-30] corrects the acknowledgement the AI read in the opening of a refusal', () => {
    const lateRefusal = {
      direction: 'inbound' as const,
      subject: 'Votre candidature',
      snippet: 'Bonjour Alex, nous vous remercions sincèrement pour l’intérêt que vous avez manifesté',
      text:
        'Bonjour Alex, nous vous remercions sincèrement pour l’intérêt que vous avez manifesté pour le poste. ' +
        'Nous avons le regret de vous annoncer que nous n’avons pas retenu votre candidature.',
    };

    expect(applyCategoryCues(lateRefusal, classified('acknowledged')).category).toBe('rejected');
  });
});

describe('applyCategoryCues — acknowledgements', () => {
  it('[RG-17] files an acknowledgement the AI took for an off-topic message', () => {
    const acknowledgement = message(
      'Accusé de réception de votre candidature',
      'Votre candidature a bien été enregistrée ; nous revenons vers vous sous 15 jours.',
    );

    expect(applyCategoryCues(acknowledgement, classified('off_topic')).category).toBe('acknowledged');
  });

  it('[RG-17] files an acknowledgement the AI took for a job alert', () => {
    const acknowledgement = message(
      'Votre candidature chez Atelier Nova',
      'Nous avons bien reçu votre candidature au poste de data analyst en alternance.',
    );

    expect(applyCategoryCues(acknowledgement, classified('job_alert')).category).toBe('acknowledged');
  });

  it('[RG-17] never downgrades an interview nor an offer to an acknowledgement', () => {
    const invitation = message(
      'Entretien — Atelier Nova',
      'Nous avons bien reçu votre candidature et souhaitons vous rencontrer mardi à 14 h.',
    );

    expect(applyCategoryCues(invitation, classified('interview')).category).toBe('interview');
    expect(applyCategoryCues(invitation, classified('offer')).category).toBe('offer');
  });

  it('[RG-17] leaves an acknowledgement the AI already recognised alone', () => {
    const acknowledgement = message('Bien reçu', 'Nous avons bien reçu votre candidature.');

    expect(applyCategoryCues(acknowledgement, classified('acknowledged'))).toEqual(
      classified('acknowledged'),
    );
  });

  it('[RG-17] a refusal opened by an acknowledgement stays a refusal', () => {
    const refusal = message(
      'Votre candidature',
      'Nous accusons réception de votre candidature. Elle n’a pas été retenue.',
    );

    expect(applyCategoryCues(refusal, classified('off_topic')).category).toBe('rejected');
  });
});
