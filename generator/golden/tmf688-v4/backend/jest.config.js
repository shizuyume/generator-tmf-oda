/**
 * Unit-test setup for the generated suite.
 *
 * Tests mock TypeORM (DataSource / EntityManager / Repository) rather than
 * hitting a database: a service generated with `--db postgres` carries postgres
 * column types and will not boot on sqlite, so an in-memory database is not an
 * option.
 *
 * `roots` is test/ ALONE. Specs live outside src/ so that coverage is measured
 * over src/ without the suite measuring itself, and so that a service still
 * carrying hand-written specs under src/ does not run two suites at once.
 */
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.json', isolatedModules: true },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/main.ts',
    '!src/**/dto/**',
    '!src/**/*.module.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov'],
};
