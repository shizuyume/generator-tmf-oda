/**
 * Unit-test setup for the generated suite.
 *
 * Tests mock TypeORM (DataSource / EntityManager / Repository) rather than
 * hitting a database: a service generated with `--db postgres` carries postgres
 * column types and will not boot on sqlite, so an in-memory database is not an
 * option.
 *
 * `roots` covers BOTH src/ and test/ so Jest's crawler can see every file
 * collectCoverageFrom asks for - including per-resource files no spec
 * imports - and report them as uncovered rather than silently dropping them
 * from coverage/lcov.info. What actually RUNS as a suite is pinned down
 * separately by `testMatch`, anchored to test/ alone: specs live outside
 * src/ so that coverage is measured over src/ without the suite measuring
 * itself, and so that a service still carrying hand-written specs under
 * src/ (as the 35 GEN_REPO services do) does not run them as a second
 * suite. `testMatch` is used instead of `testRegex` because the latter does
 * not expand the `<rootDir>` token, so it cannot be anchored the same way;
 * the two options are mutually exclusive.
 */
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.json', isolatedModules: true },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    // Hand-written specs a service may still carry under src/ (the 35 GEN_REPO
    // services do). testMatch already keeps them from RUNNING; without this
    // they would still be MEASURED as uncovered source and sink the number.
    '!src/**/*.spec.ts',
    '!src/main.ts',
    '!src/**/dto/**',
    '!src/**/*.module.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov'],
};
