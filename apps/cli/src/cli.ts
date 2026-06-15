#!/usr/bin/env -S tsx
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { DataviewEvaluator, DataviewFunctionRegistry, DataviewParser, DataviewProgram } from "@kb/dataview"
import { MarkdownDataviewRenderer } from "@kb/dataview-markdown"
import { DataviewVaultRecordSource } from "@kb/dataview-vault"
import { CheckService } from "@kb/vault-checks"
import { Glob } from "@kb/vault-core"
import { CalendarService, TaskRecurrenceService } from "@kb/vault-tasks"
import { Console, Effect } from "effect"
import { Command } from "effect/unstable/cli"
import { DashboardCommand } from "./DashboardCommand"
import { CheckCommand } from "./CheckCommand"
import { vaultServiceLayerFromFlags } from "./KbConfig"
import { McpCommand } from "./McpCommand"
import { rendererLayerForFormat } from "./OutputFormat"
import { QueryCommand } from "./QueryCommand"
import { KbRoot } from "./RootCommand"
import { TaskCommand } from "./TaskCommand"

const KbCommand = KbRoot.pipe(
  Command.withSubcommands([TaskCommand, CheckCommand, DashboardCommand, QueryCommand, McpCommand]),
  Command.provide(MarkdownDataviewRenderer.layerNoDeps),
  Command.provide(DataviewProgram.layerNoDeps),
  Command.provide(DataviewParser.layerNoDeps),
  Command.provide(DataviewVaultRecordSource.layerNoDeps),
  Command.provide(DataviewEvaluator.layerNoDeps),
  Command.provide(DataviewFunctionRegistry.layerNoDeps),
  Command.provide(CalendarService.layerLive),
  Command.provide(CheckService.layer),
  Command.provide(TaskRecurrenceService.layerNoDeps),
  Command.provide((flags) => vaultServiceLayerFromFlags(flags.vault)),
  Command.provide(Glob.layer),
  Command.provide((flags) => rendererLayerForFormat(flags.format))
)

const program = KbCommand.pipe(
  Command.run({ version: "0.1.0" }),
  Effect.tapError((error) => Console.error(error instanceof Error ? error.message : String(error)))
)

NodeRuntime.runMain(program.pipe(Effect.provide(NodeServices.layer)), { disableErrorReporting: true })
