/* Errors the handlers turn into JSON responses. status 500 is never shown raw. */
"use strict";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

class StoreError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

module.exports = { HttpError, StoreError };
