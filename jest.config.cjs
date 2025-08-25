module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['babel-jest', { configFile: './babel.config.cjs' }]
  },
  // transform p-limit (and its dependencies) which are ESM and use `import`
  transformIgnorePatterns: ['/node_modules/(?!(p-limit|yocto-queue)/)'],
  // shim Node internal export alias used by some ESM packages (p-limit uses "#async_hooks")
  moduleNameMapper: {
    '^#async_hooks$': '<rootDir>/test/jest_shims/async_hooks.js'
  }
};
