import { useId } from 'react';
import { EXPERIENCE_LEVELS, type ExperienceLevel } from '../../../api/criteria';
import { LEVEL_LABELS } from '../../../lib/experience';

interface LevelChipsProps {
  /** Accessible name of the group. */
  label: string;
  value: ExperienceLevel | null;
  onChange: (level: ExperienceLevel) => void;
  /** The text of a chip when it is not the level's name alone (« Junior (2 sur 3) »). */
  describe?: (level: ExperienceLevel) => string;
  /** A level that cannot be chosen now, such as one that holds its three offers already. */
  isLevelDisabled?: (level: ExperienceLevel) => boolean;
  isDisabled?: boolean;
  isInvalid?: boolean;
  describedBy?: string;
}

/**
 * The three levels as choice chips, all visible at once: a radio group, so the keyboard and the screen readers work as
 * usual, and the choice reads in words and not only in colour (MD3, WCAG 1.4.1).
 */
export function LevelChips({
  label,
  value,
  onChange,
  describe = (level) => LEVEL_LABELS[level],
  isLevelDisabled = () => false,
  isDisabled = false,
  isInvalid = false,
  describedBy,
}: LevelChipsProps) {
  const name = useId();
  return (
    <div
      className="chips"
      role="radiogroup"
      aria-label={label}
      aria-invalid={isInvalid}
      aria-describedby={describedBy}
    >
      {EXPERIENCE_LEVELS.map((level) => (
        <label key={level} className="chip">
          <input
            type="radio"
            name={name}
            value={level}
            checked={value === level}
            disabled={isDisabled || isLevelDisabled(level)}
            onChange={() => onChange(level)}
          />
          <span>{describe(level)}</span>
        </label>
      ))}
    </div>
  );
}
