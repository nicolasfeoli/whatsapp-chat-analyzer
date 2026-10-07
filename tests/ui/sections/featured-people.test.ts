import { describe, expect, it } from 'vitest';

import {
  FEATURED_PEOPLE_LIMIT,
  MINIMUM_REPLIES_FOR_TYPICAL_DELAY,
  formatReplyDelay,
  rankPeopleBy,
  selectFeaturedPeople,
  typicalReplyDelayOf,
} from '../../../src/ui/sections/featured-people';
import { personStatistics } from '../../fixtures/analysis-builders';

/** One second, one minute and one hour, in the unit reply delays are measured in. */
const ONE_SECOND = 1000;
const ONE_MINUTE = 60 * ONE_SECOND;
const ONE_HOUR = 60 * ONE_MINUTE;

describe('selectFeaturedPeople', () => {
  const tenPeople = Array.from({ length: 10 }, (_unused, index) =>
    personStatistics({ name: `Person ${index + 1}` }),
  );

  it('features the first eight people', () => {
    const featuredPeople = selectFeaturedPeople(tenPeople);

    expect(FEATURED_PEOPLE_LIMIT).toBe(8);
    expect(featuredPeople.map((person) => person.name)).toEqual([
      'Person 1',
      'Person 2',
      'Person 3',
      'Person 4',
      'Person 5',
      'Person 6',
      'Person 7',
      'Person 8',
    ]);
  });

  it('features everyone in a smaller chat', () => {
    expect(selectFeaturedPeople(tenPeople.slice(0, 3))).toHaveLength(3);
  });
});

describe('rankPeopleBy', () => {
  const ana = personStatistics({ name: 'Ana', wordCount: 50 });
  const bob = personStatistics({ name: 'Bob', wordCount: 200 });
  const carla = personStatistics({ name: 'Carla', wordCount: 120 });

  it('puts the highest value first when descending', () => {
    const ranking = rankPeopleBy([ana, bob, carla], (person) => person.wordCount, 'descending');

    expect(ranking).toEqual([
      { person: bob, value: 200 },
      { person: carla, value: 120 },
      { person: ana, value: 50 },
    ]);
  });

  it('puts the lowest value first when ascending', () => {
    const ranking = rankPeopleBy([ana, bob, carla], (person) => person.wordCount, 'ascending');

    expect(ranking.map((entry) => entry.person.name)).toEqual(['Ana', 'Carla', 'Bob']);
  });

  it('leaves out the people for whom there is no value', () => {
    const ranking = rankPeopleBy(
      [ana, bob, carla],
      (person) => (person.name === 'Bob' ? null : person.wordCount),
      'descending',
    );

    expect(ranking.map((entry) => entry.person.name)).toEqual(['Carla', 'Ana']);
  });

  it.each([{ direction: 'ascending' as const }, { direction: 'descending' as const }])(
    'keeps people with equal values in their original order when $direction',
    ({ direction }) => {
      const ranking = rankPeopleBy([ana, bob, carla], () => 1, direction);

      expect(ranking.map((entry) => entry.person.name)).toEqual(['Ana', 'Bob', 'Carla']);
    },
  );

  it('returns nothing for nobody', () => {
    expect(rankPeopleBy([], () => 1, 'descending')).toEqual([]);
  });
});

describe('typicalReplyDelayOf', () => {
  it('returns the median of the reply delays', () => {
    const person = personStatistics({
      name: 'Ana',
      replyDelaysInMilliseconds: [5000, 1000, 9000, 3000, 7000],
    });

    expect(typicalReplyDelayOf(person)).toBe(5000);
  });

  it('needs at least five replies', () => {
    const person = personStatistics({
      name: 'Ana',
      replyDelaysInMilliseconds: [1000, 2000, 3000, 4000],
    });

    expect(MINIMUM_REPLIES_FOR_TYPICAL_DELAY).toBe(5);
    expect(typicalReplyDelayOf(person)).toBeNull();
  });

  it('returns nothing for someone who never replied', () => {
    expect(typicalReplyDelayOf(personStatistics({ name: 'Ana' }))).toBeNull();
  });
});

describe('formatReplyDelay', () => {
  describe('an export that records seconds', () => {
    it.each([
      { delay: 0, expected: '1 s' },
      { delay: 45 * ONE_SECOND, expected: '45 s' },
      { delay: 12 * ONE_MINUTE, expected: '12 min' },
      { delay: 3 * ONE_HOUR, expected: '3.0 h' },
    ])('writes $delay ms as $expected', ({ delay, expected }) => {
      expect(formatReplyDelay(delay, 'second')).toBe(expected);
    });
  });

  describe('an export that records only minutes', () => {
    it.each([{ delay: 0 }, { delay: 30 * ONE_SECOND }, { delay: ONE_MINUTE - 1 }])(
      'writes a delay of $delay ms as "under 1 min", not as seconds it cannot know',
      ({ delay }) => {
        expect(formatReplyDelay(delay, 'minute')).toBe('under 1 min');
      },
    );

    it('writes a delay of exactly one minute as a duration', () => {
      expect(formatReplyDelay(ONE_MINUTE, 'minute')).toBe('1 min');
    });

    it('writes longer delays as durations', () => {
      expect(formatReplyDelay(12 * ONE_MINUTE, 'minute')).toBe('12 min');
    });
  });
});
