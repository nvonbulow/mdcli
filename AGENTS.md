# Repository agent instructions

- Treat `vendor/effect` as the source of truth for Effect APIs, service design, package layout, tests, and TypeScript idioms. Read the relevant vendor files before implementing Effect services, layers, CLI commands, or package structure.
- Use normal static imports for types and values. Do not use inline dynamic `import("...")` type references in exported signatures.
- Hardcode nothing in Dataview/query code: no environment paths, default sources, field allowlists, filter shapes, or command-specific assumptions in parser/evaluator internals. Pass defaults and policy explicitly from CLI/services.
- Keep app and package code Effect-based TypeScript only.
- Do not introduce `async`, `await`, `try/catch`, `throw`, `Date.now`, `new Date`, or TypeScript `interface` in app/package code.
- Prefer Jujutsu (`jj`) for version-control operations and keep logical work in atomic changesets.
