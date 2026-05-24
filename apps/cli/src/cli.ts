#!/usr/bin/env -S tsx
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import {
  DataviewEvaluator,
  DataviewFunctionRegistry,
  DataviewParser,
  DataviewProgram,
  DataviewRecordSource,
  MarkdownDataviewRenderer,
  MarkdownFenceParser
} from "@kb/dataview"
import { CalendarService, CatalogService, CheckService, Glob, VaultService } from "@kb/vault"
import { Effect } from "effect"
import { Command } from "effect/unstable/cli"
import { DashboardCommand } from "./DashboardCommand"
import { CheckCommand } from "./CheckCommand"
import { rendererLayerForFormat } from "./OutputFormat"
import { QueryCommand } from "./QueryCommand"
import { KbRoot } from "./RootCommand"
import { TaskCommand } from "./TaskCommand"

const KbCommand = KbRoot.pipe(
  Command.withSubcommands([TaskCommand, CheckCommand, DashboardCommand, QueryCommand]),
  Command.provide(MarkdownDataviewRenderer.layerNoDeps),
  Command.provide(DataviewProgram.layerNoDeps),
  Command.provide(DataviewParser.layerNoDeps),
  Command.provide(DataviewRecordSource.layerNoDeps),
  Command.provide(DataviewEvaluator.layerNoDeps),
  Command.provide(DataviewFunctionRegistry.layerNoDeps),
  Command.provide(MarkdownFenceParser.layerNoDeps),
  Command.provide(CalendarService.layerLive),
  Command.provide(CheckService.layer),
  Command.provide(CatalogService.layer),
  Command.provide((flags) => VaultService.makeLayer({ root: flags.vault })),
  Command.provide(Glob.layer),
  Command.provide((flags) => rendererLayerForFormat(flags.format))
)

const program = KbCommand.pipe(Command.run({ version: "0.1.0" }))

NodeRuntime.runMain(program.pipe(Effect.provide(NodeServices.layer)), { disableErrorReporting: true })
