import { describe, expect, it } from 'vitest';
import { DocxRequestSchema } from './schemas.js';

describe('DocxRequestSchema', () => {
  it('[RG-24] [EF-CVX-28] accepts 6 ticked skills and refuses a seventh, with a clear message', () => {
    const skills = ['dbt', 'Airflow', 'Spark', 'Kafka', 'Looker', 'Tableau', 'Snowflake'];

    expect(DocxRequestSchema.safeParse({ addedSkills: skills.slice(0, 6) }).success).toBe(true);
    const refused = DocxRequestSchema.safeParse({ addedSkills: skills });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]?.message).toBe('Cochez 6 compétences au plus : la page n’a de place que pour elles.');
  });
});
