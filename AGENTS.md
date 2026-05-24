# Repository agent instructions

- Treat `vendor/effect` as the source of truth for Effect APIs, service design, package layout, tests, and TypeScript idioms. Read the relevant vendor files before implementing Effect services, layers, CLI commands, or package structure.
- Keep meaningful `packages/vault` and `packages/dataview` behavior on `Context.Service` classes and provide it through layers.
- Do not add exported naked behavior functions or raw helper APIs that bypass services; model/schema constants and data classes are acceptable.
- Put vault configuration in `VaultService.makeLayer({ root })`; do not invent hidden default root/source paths.
- Route Dataview execution through `DataviewProgram`, record sourcing through `DataviewRecordSource` backed by `VaultService`, and keep parser/evaluator internals dynamic without field allowlists or command-specific semantics.
- Put output format selection in `DataviewRenderer` implementation layers, not config services or renderer method parameters.
- Keep CLI commands thin: read typed flags/args, choose/provide layers, delegate to services, print.
- Keep CLI command files flat in `apps/cli/src` unless a command grows into multiple files; do not create one-file command subdirectories.
- Hoist CLI flags to the highest shared command parent: `--vault` and `--format` belong on the `kb` root, and task-only `--source` belongs on `task`.
- CLI defaults are explicit policy: root `--vault` defaults to `./vault`, root `--format` defaults to `pretty`, and task `--source` defaults to `.` for whole-vault scans.
- Provide shared CLI dependency layers at the root command where practical; subcommands should yield services instead of repeating `Effect.provide(...)` chains.
- Dashboard rendering reads markdown through `VaultService`, executes fenced `dataview` blocks through dataview services, and preserves surrounding markdown/non-dataview fences.
- Use normal static imports for types and values. Do not use inline dynamic `import("...")` type references in exported signatures.
- Keep hardcoded environment defaults out of app/package code; pass policy and defaults explicitly from CLI/services.
- Keep app and package code Effect-based TypeScript only.
- Do not introduce `async`, `await`, `try/catch`, `throw`, `Date.now`, `new Date`, or TypeScript `interface` in app/package code.
- Prefer Jujutsu (`jj`) for version-control operations and keep logical work in atomic changesets.
- `aube --filter @kb/cli run ...` executes scripts from `apps/cli`, so `--vault ./vault` resolves to `apps/cli/vault`; use `--vault ../../vault` for filtered package smoke checks, or run the CLI from the workspace root when verifying the default `./vault`.
