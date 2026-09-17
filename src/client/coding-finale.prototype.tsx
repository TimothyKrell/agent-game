/** TIM-49 development-only fixture browser. */
import { useState } from 'react';
import { codingFinaleFixture, codingFinaleFixtureNames } from './coding-finale-fixtures';
import type { CodingFinaleFixtureName } from './coding-finale-fixtures';
import { CodingFinale } from './coding-finale';
import { navigate, useLocation } from './navigation';

function isFixtureName(value: string | null): value is CodingFinaleFixtureName {
  return value !== null && codingFinaleFixtureNames.some((name) => name === value);
}

export default function CodingFinalePrototype() {
  const url = new URL(useLocation());
  const requested = url.searchParams.get('fixture');
  const fixture: CodingFinaleFixtureName = isFixtureName(requested) ? requested : 'racing';
  const [submission, setSubmission] = useState('');
  const view = codingFinaleFixture(fixture);

  const choose = (next: string) => {
    url.searchParams.set('fixture', next);
    navigate(url.pathname + url.search);
  };

  return (
    <>
      <div className="cf-review-bar">
        <strong>TIM-49 · PRESENTATION REVIEW</strong>
        <label>
          Fixture
          <select value={fixture} onChange={(event) => choose(event.target.value)}>
            {codingFinaleFixtureNames.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <span>Protocol adapter review surface · not a live match</span>
      </div>
      {submission && (
        <div className="cf-review-receipt" role="status">
          {submission && `Local interaction captured: ${submission}. `}
        </div>
      )}
      <CodingFinale
        view={view}
        onSubmit={(_source, language) => setSubmission(`${language} Tier ${view.challenge?.tier ?? 1}`)}
        onOpenSource={async () => ({
          language: 'typescript',
          source: 'export function solve(input: unknown) {\n  return 31;\n}',
        })}
      />
    </>
  );
}
