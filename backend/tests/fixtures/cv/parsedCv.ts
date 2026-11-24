import type { ParsedCv } from '../../../src/modules/cvWorkshop/anchoring.js';

/** A fictitious CV as T-520 parses it: every text is a substring of {@link PARSED_CV_SOURCE}. */
export const PARSED_CV_SOURCE = [
  'Data analyst confirmé',
  'Analyste de données. Trois ans en tableaux de bord.',
  'Data Analyst – Atelier Nova, Paris | 09/2021 – 06/2023',
  'Création de 12 tableaux de bord Power BI',
  'Automatisation de rapports avec Python',
  'Support de 10 000 utilisateurs',
  'Développeuse',
  'Master Informatique – Université de Lyon | 2019 – 2021',
  'Mention bien',
  'Major de promotion',
  'SQL, Python, Power BI',
  'Anglais courant',
  'Course à pied',
].join('\n');

const item = (id: string, text: string) => ({ id, text });

export const PARSED_CV: ParsedCv = {
  headline: 'Data analyst confirmé',
  profile: 'Analyste de données. Trois ans en tableaux de bord.',
  experiences: [
    {
      id: 'exp_0',
      title: 'Data Analyst',
      organization: 'Atelier Nova',
      place: 'Paris',
      dates: '09/2021 – 06/2023',
      bullets: [
        item('exp_0.b0', 'Création de 12 tableaux de bord Power BI'),
        item('exp_0.b1', 'Automatisation de rapports avec Python'),
        item('exp_0.b2', 'Support de 10 000 utilisateurs'),
      ],
    },
    { id: 'exp_1', title: 'Développeuse', organization: null, place: null, dates: null, bullets: [] },
  ],
  education: [
    {
      id: 'edu_0',
      degree: 'Master Informatique',
      school: 'Université de Lyon',
      place: null,
      dates: '2019 – 2021',
      details: [item('edu_0.d0', 'Mention bien'), item('edu_0.d1', 'Major de promotion')],
    },
  ],
  skills: [item('skill_0', 'SQL'), item('skill_1', 'Python'), item('skill_2', 'Power BI')],
  certifications: [],
  languages: [item('lang_0', 'Anglais courant')],
  interests: [item('int_0', 'Course à pied')],
  dropped: 0,
};
