module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': ['babel-jest', { configFile: './babel.config.cjs' }]
  },
  // transform p-limit (and its dependencies) which are ESM and use `import`
  transformIgnorePatterns: ['/node_modules/(?!(p-limit|yocto-queue)/)'],
};
