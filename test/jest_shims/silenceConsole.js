// Silence console output during tests unless explicitly enabled
const orig = { log: console.log, info: console.info, warn: console.warn };

beforeAll(() => {
  if (!process.env.TEST_VERBOSE_LOGS) {
    // eslint-disable-next-line no-console
    console.log = () => {};
    // eslint-disable-next-line no-console
    console.info = () => {};
    // eslint-disable-next-line no-console
    console.warn = () => {};
  }
});

afterAll(() => {
  // eslint-disable-next-line no-console
  console.log = orig.log;
  // eslint-disable-next-line no-console
  console.info = orig.info;
  // eslint-disable-next-line no-console
  console.warn = orig.warn;
});
