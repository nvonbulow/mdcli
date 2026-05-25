import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import { assert, describe, it } from "vitest"
import { Glob } from "@kb/vault"
import { Effect, FileSystem, Layer, Option, Path } from "effect"
import { KbConfigError, resolveVaultRoot } from "../src/KbConfig"

const LiveTestServices = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  Glob.layer
)

const withLiveTestServices = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Glob.Glob>) =>
  Effect.provide(effect, LiveTestServices)

const makeVault = (root: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const notes = path.join(root, "Notes")
    yield* fs.makeDirectory(notes, { recursive: true })
    yield* fs.writeFileString(path.join(notes, "Visible.md"), "# Visible\n")
    return root
  })

const makeConfig = (configHome: string, vault: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const configDirectory = path.join(configHome, "kb")
    yield* fs.makeDirectory(configDirectory, { recursive: true })
    yield* fs.writeFileString(path.join(configDirectory, "config.yaml"), `vault: ${vault}\n`)
  })

const makeEmptyConfigHome = (root: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const configHome = path.join(root, "config")
    yield* fs.makeDirectory(configHome, { recursive: true })
    return configHome
  })

const assertConfigError = (error: unknown, source: string, candidate: string) => {
  assert.ok(error instanceof KbConfigError)
  assert.ok(error.message.includes(source), error.message)
  assert.ok(error.message.includes(candidate), error.message)
}

describe("KbConfig", () => {
  it("uses explicit --vault path before KB_VAULT and YAML config", () =>
    Effect.scoped(
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "kb-config-" })
        const explicitVault = yield* makeVault(path.join(root, "explicit"))
        const envVault = yield* makeVault(path.join(root, "env"))
        const yamlVault = yield* makeVault(path.join(root, "yaml"))
        const configHome = path.join(root, "xdg")
        yield* makeConfig(configHome, yamlVault)

        const resolved = yield* resolveVaultRoot(Option.some(explicitVault), {
          cwd: root,
          env: {
            KB_VAULT: envVault,
            XDG_CONFIG_HOME: configHome
          }
        })

        assert.strictEqual(resolved, explicitVault)
      })
    ).pipe(withLiveTestServices, Effect.runPromise))

  it("uses KB_VAULT before YAML config", () =>
    Effect.scoped(
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "kb-config-" })
        const envVault = yield* makeVault(path.join(root, "env"))
        const yamlVault = yield* makeVault(path.join(root, "yaml"))
        const configHome = path.join(root, "xdg")
        yield* makeConfig(configHome, yamlVault)

        const resolved = yield* resolveVaultRoot(Option.none(), {
          cwd: root,
          env: {
            KB_VAULT: envVault,
            XDG_CONFIG_HOME: configHome
          }
        })

        assert.strictEqual(resolved, envVault)
      })
    ).pipe(withLiveTestServices, Effect.runPromise))

  it("uses YAML config from XDG config home when flag and env are absent", () =>
    Effect.scoped(
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "kb-config-" })
        const yamlVault = yield* makeVault(path.join(root, "yaml"))
        const configHome = path.join(root, "xdg")
        yield* makeConfig(configHome, yamlVault)

        const resolved = yield* resolveVaultRoot(Option.none(), {
          cwd: root,
          env: {
            XDG_CONFIG_HOME: configHome
          }
        })

        assert.strictEqual(resolved, yamlVault)
      })
    ).pipe(withLiveTestServices, Effect.runPromise))

  it("falls back to . when cwd is a detected vault root", () =>
    Effect.scoped(
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "kb-config-" })
        const vault = yield* makeVault(path.join(root, "vault"))
        const configHome = yield* makeEmptyConfigHome(root)

        const resolved = yield* resolveVaultRoot(Option.none(), {
          cwd: vault,
          env: {
            XDG_CONFIG_HOME: configHome
          }
        })

        assert.strictEqual(resolved, vault)
      })
    ).pipe(withLiveTestServices, Effect.runPromise))

  it("fails clearly when a configured path does not exist", () =>
    Effect.scoped(
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "kb-config-" })
        const missingVault = path.join(root, "missing")
        const error = yield* Effect.flip(resolveVaultRoot(Option.none(), {
          cwd: root,
          env: {
            KB_VAULT: missingVault
          }
        }))

        assertConfigError(error, "KB_VAULT", missingVault)
      })
    ).pipe(withLiveTestServices, Effect.runPromise))

  it("fails clearly when an existing configured directory has no visible Markdown files", () =>
    Effect.scoped(
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "kb-config-" })
        const emptyVault = path.join(root, "empty")
        yield* fs.makeDirectory(emptyVault, { recursive: true })
        const error = yield* Effect.flip(resolveVaultRoot(Option.none(), {
          cwd: root,
          env: {
            KB_VAULT: emptyVault
          }
        }))

        assertConfigError(error, "KB_VAULT", emptyVault)
      })
    ).pipe(withLiveTestServices, Effect.runPromise))

  it("honors .kbignore when detecting vault roots", () =>
    Effect.scoped(
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "kb-config-" })
        const ignoredVault = path.join(root, "ignored")
        const configHome = yield* makeEmptyConfigHome(root)
        yield* fs.makeDirectory(ignoredVault, { recursive: true })
        yield* fs.writeFileString(path.join(ignoredVault, ".kbignore"), "*.md\n")
        yield* fs.writeFileString(path.join(ignoredVault, "Ignored.md"), "# Ignored\n")

        const error = yield* Effect.flip(resolveVaultRoot(Option.none(), {
          cwd: ignoredVault,
          env: {
            XDG_CONFIG_HOME: configHome
          }
        }))

        assertConfigError(error, ".", ignoredVault)
      })
    ).pipe(withLiveTestServices, Effect.runPromise))
})
