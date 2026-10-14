const ref = (line: number, text: string) => ({ line, text });

/** What a model answers to `parse_cv` for the fictitious CV of `pdf.ts`; the dates are written another way than the CV does. */
export const FICTITIOUS_STRUCTURE = {
  headline: ref(1, 'Data Analyst'),
  profile: [],
  experiences: [
    {
      title: ref(3, 'Data Analyst'),
      organization: ref(3, 'Atelier Nova'),
      place: null,
      dates: ref(3, '09/2024-08/2026'),
      bullets: [ref(4, 'Tableaux de bord Power BI pour 12 equipes commerciales.')],
    },
  ],
  education: [
    { degree: ref(6, 'Master Informatique'), school: ref(6, 'Universite de Lyon'), place: null, dates: ref(6, '2024'), details: [] },
  ],
  skills: [ref(8, 'SQL'), ref(8, 'Python'), ref(8, 'Power BI')],
  certifications: [],
  languages: [],
  interests: [],
};
