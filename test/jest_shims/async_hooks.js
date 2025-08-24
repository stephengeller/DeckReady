// Minimal AsyncResource shim for Jest environment to satisfy packages
class AsyncResource {
  constructor() {}
  static bind(fn) { return fn; }
}
module.exports = { AsyncResource };
