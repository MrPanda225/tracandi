import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdaptedCvCard, MAX_TICKED_SKILLS, SkillsToAdd } from './AdaptedCv';

const SKILLS = ['dbt', 'Airflow', 'Spark', 'Kafka', 'Looker', 'Tableau', 'Snowflake', 'Terraform'];

function Ticking() {
  const [ticked, setTicked] = useState<string[]>([]);
  return <SkillsToAdd skills={SKILLS} ticked={ticked} onTickedChange={setTicked} />;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SkillsToAdd', () => {
  it('[RG-24] [EF-CVX-28] lets tick 6 skills at most, says why the others wait, and frees them once one is unticked', async () => {
    const user = userEvent.setup();
    render(<Ticking />);

    for (const skill of SKILLS.slice(0, MAX_TICKED_SKILLS)) await user.click(screen.getByRole('checkbox', { name: skill }));

    expect(MAX_TICKED_SKILLS).toBe(6);
    expect(screen.getByRole('checkbox', { name: 'Snowflake' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Terraform' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'dbt' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Vous avez coché 6 compétences : c’est ce qui tient sur la page.',
    );
    expect(screen.getByRole('checkbox', { name: 'Snowflake' })).toHaveAccessibleDescription(
      /c’est ce qui tient sur la page/,
    );

    await user.click(screen.getByRole('checkbox', { name: 'dbt' }));

    expect(screen.getByRole('checkbox', { name: 'Snowflake' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});

describe('AdaptedCvCard', () => {
  it('[EF-CVX-25] shows two entries with the same title and no company nor dates, without a key collision', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const entry = { title: 'Stagiaire', organization: null, place: null, dates: null, bullets: [] };
    const degree = { degree: 'Licence', school: null, place: null, dates: null, detail: null };
    const cv = {
      headline: 'Data Analyst',
      profile: '',
      experiences: [entry, { ...entry }],
      education: [degree, { ...degree }],
      skills: [],
      certifications: [],
      languages: [],
      interests: [],
    };

    render(
      <AdaptedCvCard
        cv={cv}
        contacts={{ name: null, emails: [], phones: [], address: null, links: [] }}
        runId={1}
        ticked={[]}
      />,
    );

    expect(screen.getAllByText('Stagiaire')).toHaveLength(2);
    expect(screen.getAllByText('Licence')).toHaveLength(2);
    expect(error.mock.calls.flat().join(' ')).not.toMatch(/same key/);
  });

  it('[EF-CVX-25] shows a bullet the model repeated twice, without a key collision', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bullet = 'Conception de tableaux de bord.';
    const cv = {
      headline: 'Data Analyst',
      profile: '',
      experiences: [{ title: 'Stagiaire', organization: null, place: null, dates: null, bullets: [bullet, bullet] }],
      education: [],
      skills: [],
      certifications: [],
      languages: [],
      interests: [],
    };

    render(
      <AdaptedCvCard
        cv={cv}
        contacts={{ name: null, emails: [], phones: [], address: null, links: [] }}
        runId={1}
        ticked={[]}
      />,
    );

    expect(screen.getAllByText(bullet)).toHaveLength(2);
    expect(error.mock.calls.flat().join(' ')).not.toMatch(/same key/);
  });

  it('[EF-CVX-25] shows two lines of a list under the same heading, without a key collision', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cv = {
      headline: 'Data Analyst',
      profile: '',
      experiences: [],
      education: [],
      skills: ['Langages : Python, SQL', 'Langages : R, Go'],
      certifications: [],
      languages: [],
      interests: [],
    };

    render(
      <AdaptedCvCard
        cv={cv}
        contacts={{ name: null, emails: [], phones: [], address: null, links: [] }}
        runId={1}
        ticked={[]}
      />,
    );

    expect(screen.getAllByText('Langages')).toHaveLength(2);
    expect(screen.getByText('Python, SQL')).toBeInTheDocument();
    expect(screen.getByText('R, Go')).toBeInTheDocument();
    expect(error.mock.calls.flat().join(' ')).not.toMatch(/same key/);
  });
});
