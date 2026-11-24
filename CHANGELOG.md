# Changelog

Versions follow [semver](https://semver.org). Changes to the API itself are
in the [API changelog](https://api.fiz.co/docs/changelog).

## 0.1.0 — unreleased

First release.

- Every operation of the FIZ API, typed from its OpenAPI document.
- An `Idempotency-Key` on every write, reused by automatic retries.
- Retries of rate-limited requests, of writes still in progress and of
  failed reads, honouring `Retry-After`.
- Errors as classes with `status`, `code`, `messages` and `requestId`.
- `listAll` iterators over every list, and PDF downloads.
- API key or OAuth access token; a `fiz_test_` key reaches the sandbox.
