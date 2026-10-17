# fo-claims-agent

A Fo agent that files card disputes and insurance or package claims for you and follows up until they're resolved.

Built for the Wajo GSD hackathon on [Fo](https://wajo.ai), Wajo's action agent.

## Status

Work in progress. Full README coming before the final submission.

## Layout

- `api/` backend service (FastAPI, SQLite, Fo client)
- `web/` dashboard (Next.js)
- `tests/` tests
- `docs/` specs and notes

## Setup

Copy `.env.example` to `.env` and fill in your own keys. Never commit `.env`.

## License

MIT
