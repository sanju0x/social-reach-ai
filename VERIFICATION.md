# Verification

- Node.js 24.22.3; npm 11.19.1.
- `npm test`: 25 tests passed, 0 failed.
- `npm pack`: installable tarball created.
- Installed the tarball into a clean directory without external dependencies.
- Installed `social-reach analyze --input examples/snapshot.json` completed successfully.
- A live YouTube handle probe returned HTTP 200 without usable profile metadata; reported `unavailable`, with no fabricated data. Live availability on the five platforms is not certified.
- AI integration was tested with a mocked provider; no paid AI request was made.
- Package name availability was not checked; package has not been published to npm.
