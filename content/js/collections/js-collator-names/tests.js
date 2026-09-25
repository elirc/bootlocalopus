const { sortNames, sameName, filterByPrefix } = solution;

describe('sortNames', () => {
  it('ignores case and puts accented letters next to their base letter (en)', () => {
    expect(sortNames(['zoe', 'Émile', 'Bob', 'Eli', 'alice', 'Emma', 'Zack'], 'en'))
      .toEqual(['alice', 'Bob', 'Eli', 'Émile', 'Emma', 'Zack', 'zoe']);
  });

  it('compares digit runs as numbers', () => {
    expect(sortNames(['Room 10', 'Room 2', 'Room 1', 'Room 21', 'Room 3'], 'en'))
      .toEqual(['Room 1', 'Room 2', 'Room 3', 'Room 10', 'Room 21']);
    expect(sortNames(['v1.10.0', 'v1.9.2', 'v1.2.0'], 'en')).toEqual(['v1.2.0', 'v1.9.2', 'v1.10.0']);
  });

  it('follows Swedish rules: Å, Ä, Ö come after Z', () => {
    expect(sortNames(['Östberg', 'Zetterlund', 'Andersson', 'Åberg', 'Ärlig', 'Olsson'], 'sv'))
      .toEqual(['Andersson', 'Olsson', 'Zetterlund', 'Åberg', 'Ärlig', 'Östberg']);
  });

  it('follows German rules: Ö files with O', () => {
    expect(sortNames(['Östberg', 'Zetterlund', 'Olsson', 'Ober', 'Andersson'], 'de'))
      .toEqual(['Andersson', 'Ober', 'Olsson', 'Östberg', 'Zetterlund']);
  });

  it('returns a new array and does not mutate the input', () => {
    const names = ['b', 'a'];
    const out = sortNames(names, 'en');
    expect(out).not.toBe(names);
    expect(names).toEqual(['b', 'a']);
  });
});

describe('sameName', () => {
  it('ignores case and accents', () => {
    expect(sameName('José', 'jose', 'en')).toBe(true);
    expect(sameName('ZOË', 'zoe', 'en')).toBe(true);
    expect(sameName('Renée', 'RENEE', 'fr')).toBe(true);
  });

  it('treats composed and decomposed accents as the same', () => {
    expect(sameName('José', 'José', 'en')).toBe(true);
  });

  it('still tells different names apart', () => {
    expect(sameName('Anna', 'Ana', 'en')).toBe(false);
    expect(sameName('Lee', 'Leo', 'en')).toBe(false);
  });

  it('uses the locale\'s idea of an accent', () => {
    expect(sameName('Öberg', 'Oberg', 'de')).toBe(true);
    expect(sameName('Öberg', 'Oberg', 'sv')).toBe(false);
    expect(sameName('Öberg', 'öberg', 'sv')).toBe(true);
  });
});

describe('filterByPrefix', () => {
  const names = ['Émile', 'emma', 'Eli', 'Östberg', 'Oliver', 'Zoë', 'Élodie'];

  it('matches regardless of case and accents, keeping input order', () => {
    expect(filterByPrefix(names, 'em', 'en')).toEqual(['Émile', 'emma']);
    expect(filterByPrefix(names, 'EL', 'en')).toEqual(['Eli', 'Élodie']);
    expect(filterByPrefix(names, 'zoe', 'en')).toEqual(['Zoë']);
  });

  it('matches an accented query against unaccented names too', () => {
    expect(filterByPrefix(names, 'él', 'en')).toEqual(['Eli', 'Élodie']);
  });

  it('respects the locale: "o" finds Östberg in German, not in Swedish', () => {
    expect(filterByPrefix(names, 'o', 'de')).toEqual(['Östberg', 'Oliver']);
    expect(filterByPrefix(names, 'o', 'sv')).toEqual(['Oliver']);
    expect(filterByPrefix(names, 'ö', 'sv')).toEqual(['Östberg']);
  });

  it('returns every name for an empty query and none for no match', () => {
    expect(filterByPrefix(names, '', 'en')).toEqual(names);
    expect(filterByPrefix(names, 'q', 'en')).toEqual([]);
  });
});
