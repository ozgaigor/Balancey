/**
 * Testy dotyczą czystej logiki obliczeniowej (grosze, salda, budżety, daty),
 * dlatego nie potrzebują środowiska React Native — wystarczy transpilacja TS.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  transform: {
    '^.+\.[jt]sx?$': [
      'babel-jest',
      {
        babelrc: false,
        configFile: false,
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          '@babel/preset-typescript',
        ],
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
};
