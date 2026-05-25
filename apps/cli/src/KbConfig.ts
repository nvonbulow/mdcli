import { allMarkdown, VaultService } from "@kb/vault"
import { Config, ConfigProvider, Data, Effect, FileSystem, Layer, Option, Path, Schema, Trie } from "effect"
import { Primitive } from "effect/unstable/cli"

export type KbConfigEnv = Readonly<Record<string, string | undefined>>

export type VaultRootSource = "flag" | "KB_VAULT" | "config" | "default"

export type ResolveVaultRootOptions = {
  readonly env?: KbConfigEnv
  readonly cwd?: string
}

export class KbConfigError extends Data.TaggedError("KbConfigError")<{
  readonly source: VaultRootSource
  readonly path?: string | undefined
  readonly message: string
}> {}

const AppConfigSchema = Schema.Struct({
  vault: Schema.String
})

const appConfigPrimitive = Primitive.fileSchema(AppConfigSchema, { format: "yaml" })

const sanitizedEnv = (env: KbConfigEnv | undefined): Record<string, string> | undefined => {
  if (env === undefined) {
    return undefined
  }

  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined) {
      out[name] = value
    }
  }
  return out
}

const rawEnvProvider = (env: KbConfigEnv | undefined): ConfigProvider.ConfigProvider =>
  env === undefined ? ConfigProvider.fromEnv() : ConfigProvider.fromEnv({ env: sanitizedEnv(env) })

const envVaultProvider = (env: KbConfigEnv | undefined): ConfigProvider.ConfigProvider =>
  rawEnvProvider(env).pipe(ConfigProvider.nested("kb"), ConfigProvider.constantCase)

const vaultConfig = Config.string("vault")

const configValue = (provider: ConfigProvider.ConfigProvider) => Effect.option(vaultConfig.parse(provider))

const optionalEnvValue = (env: KbConfigEnv | undefined, name: string) =>
  Effect.option(Config.string(name).parse(rawEnvProvider(env)))

export const appConfigFilePath = Effect.fn("KbConfig.appConfigFilePath")(function* (
  options: ResolveVaultRootOptions = {}
) {
  const path = yield* Path.Path
  const xdgConfigHome = yield* optionalEnvValue(options.env, "XDG_CONFIG_HOME")
  if (Option.isSome(xdgConfigHome)) {
    return path.join(xdgConfigHome.value, "kb", "config.yaml")
  }

  const home = yield* optionalEnvValue(options.env, "HOME")
  if (Option.isSome(home)) {
    return path.join(home.value, ".config", "kb", "config.yaml")
  }

  return yield* Effect.fail(
    new KbConfigError({
      source: "config",
      message: "Unable to locate config source path: neither XDG_CONFIG_HOME nor HOME is set"
    })
  )
})

const configFileProvider = Effect.fn("KbConfig.configFileProvider")(function* (options: ResolveVaultRootOptions) {
  const fs = yield* FileSystem.FileSystem
  const configPathOption = yield* Effect.option(appConfigFilePath(options))
  if (Option.isNone(configPathOption)) {
    return ConfigProvider.fromUnknown({})
  }
  const configPath = configPathOption.value
  const exists = yield* fs.exists(configPath).pipe(
    Effect.mapError(
      (cause) =>
        new KbConfigError({
          source: "config",
          path: configPath,
          message: `Unable to check config source at ${configPath}: ${cause.message}`
        })
    )
  )

  if (!exists) {
    return ConfigProvider.fromUnknown({})
  }

  const config = yield* appConfigPrimitive.parse(configPath).pipe(
    Effect.mapError(
      (message) =>
        new KbConfigError({
          source: "config",
          path: configPath,
          message: `Invalid config source at ${configPath}: ${message}`
        })
    )
  )

  return ConfigProvider.fromUnknown(config)
})

export const appConfigProvider = Effect.fn("KbConfig.appConfigProvider")(function* (
  options: ResolveVaultRootOptions = {}
) {
  const yamlProvider = yield* configFileProvider(options)
  return envVaultProvider(options.env).pipe(ConfigProvider.orElse(yamlProvider))
})

const configFileVault = Effect.fn("KbConfig.configFileVault")(function* (options: ResolveVaultRootOptions) {
  const provider = yield* configFileProvider(options)
  return yield* configValue(provider)
})

const pathForCandidate = Effect.fn("KbConfig.pathForCandidate")(function* (candidate: string, options: ResolveVaultRootOptions) {
  const path = yield* Path.Path
  if (path.isAbsolute(candidate)) {
    return candidate
  }
  if (options.cwd !== undefined) {
    return path.resolve(options.cwd, candidate)
  }
  return path.resolve(candidate)
})

const selectedRoot = Effect.fn("KbConfig.selectedRoot")(function* (
  vault: Option.Option<string>,
  options: ResolveVaultRootOptions
) {
  if (Option.isSome(vault)) {
    return { source: "flag" as const, path: vault.value }
  }

  const envVault = yield* configValue(envVaultProvider(options.env))
  if (Option.isSome(envVault)) {
    return { source: "KB_VAULT" as const, path: envVault.value }
  }

  const yamlVault = yield* configFileVault(options)
  if (Option.isSome(yamlVault)) {
    return { source: "config" as const, path: yamlVault.value }
  }

  return { source: "default" as const, path: "." }
})

const rootSourceLabel = (source: VaultRootSource, candidate: string): string =>
  source === "default" ? `default ${candidate}` : source

const validateVaultRoot = Effect.fn("KbConfig.validateVaultRoot")(function* (
  source: VaultRootSource,
  root: string,
  candidate: string
) {
  const fs = yield* FileSystem.FileSystem
  const info = yield* fs.stat(root).pipe(
    Effect.mapError(
      (cause) =>
        new KbConfigError({
          source,
          path: root,
          message: `Invalid vault root from ${rootSourceLabel(source, candidate)} at ${root}: ${cause.message}`
        })
    )
  )

  if (info.type !== "Directory") {
    return yield* Effect.fail(
      new KbConfigError({
        source,
        path: root,
        message: `Invalid vault root from ${rootSourceLabel(source, candidate)} at ${root}: path is not a directory`
      })
    )
  }

  const tree = yield* Effect.gen(function* () {
    const service = yield* VaultService
    return yield* service.readMarkdownTree(allMarkdown)
  }).pipe(
    Effect.provide(VaultService.makeLayer({ root })),
    Effect.mapError(
      (cause) =>
        new KbConfigError({
          source,
          path: root,
          message: `Invalid vault root from ${rootSourceLabel(source, candidate)} at ${root}: ${cause.message}`
        })
    )
  )

  for (const _entry of Trie.entries(tree.files)) {
    return root
  }

  return yield* Effect.fail(
    new KbConfigError({
      source,
      path: root,
      message: `Invalid vault root from ${rootSourceLabel(source, candidate)} at ${root}: no Markdown files found after .kbignore rules`
    })
  )
})

export const resolveVaultRoot = Effect.fn("KbConfig.resolveVaultRoot")(function* (
  vault: Option.Option<string>,
  options: ResolveVaultRootOptions = {}
) {
  const candidate = yield* selectedRoot(vault, options)
  const root = yield* pathForCandidate(candidate.path, options)
  return yield* validateVaultRoot(candidate.source, root, candidate.path)
})

export const vaultServiceLayerFromFlags = (vault: Option.Option<string>) =>
  Layer.unwrap(resolveVaultRoot(vault).pipe(Effect.map((root) => VaultService.makeLayer({ root }))))
