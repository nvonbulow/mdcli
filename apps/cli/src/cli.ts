#!/usr/bin/env -S tsx
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect } from "effect"
import { Command } from "effect/unstable/cli"
import { DashboardCommand } from "./dashboard/DashboardCommand"
import { QueryCommand } from "./query/QueryCommand"
import { TaskCommand } from "./task/TaskCommand"

const KbCommand = Command.make("kb").pipe(
  Command.withDescription("Knowledge-base command line tools"),
  Command.withSubcommands([TaskCommand, DashboardCommand, QueryCommand])
)

const program = KbCommand.pipe(Command.run({ version: "0.1.0" }))

NodeRuntime.runMain(program.pipe(Effect.provide(NodeServices.layer)))
