import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { ParsedTask, ValidationProblem } from "./TaskModel"
import { isIsoDate } from "./TaskParser"

export type TaskValidatorShape = {
  readonly validate: (tasks: ReadonlyArray<ParsedTask>) => Effect.Effect<ReadonlyArray<ValidationProblem>, never>
}

export class TaskValidator extends Context.Service<TaskValidator, TaskValidatorShape>()("@kb/vault/TaskValidator") {
  static readonly layerLive: Layer.Layer<TaskValidator> = Layer.effect(TaskValidator, makeTaskValidator())
}

export const taskValidatorLayerLive = TaskValidator.layerLive

const validateTaskList = (tasks: ReadonlyArray<ParsedTask>): ReadonlyArray<ValidationProblem> => {
  const problems: Array<ValidationProblem> = []

  for (const task of tasks) {
    for (const fieldName of dateFieldNames) {
      const value = task.fields[fieldName]
      if (value !== undefined && !isIsoDate(value)) {
        problems.push(
          new ValidationProblem({
            severity: "error",
            message: `Invalid ${fieldName} date: ${value}`,
            source: task.source
          })
        )
      }
    }

    if (task.done) {
      continue
    }

    if (task.area === undefined || task.area.length === 0) {
      problems.push(
        new ValidationProblem({
          severity: "error",
          message: "Open task is missing [area:: ...] metadata",
          source: task.source
        })
      )
    }

    if (task.project === undefined || task.project.length === 0) {
      problems.push(
        new ValidationProblem({
          severity: "error",
          message: "Open task is missing [project:: ...] metadata",
          source: task.source
        })
      )
    }
  }

  return problems
}

const dateFieldNames = ["scheduled", "due", "completed"] as const

function makeTaskValidator(): Effect.Effect<TaskValidatorShape> {
  return Effect.sync(() =>
    TaskValidator.of({
      validate: Effect.fn("@kb/vault/TaskValidator.validate")((tasks: ReadonlyArray<ParsedTask>) =>
        Effect.succeed(validateTaskList(tasks))
      )
    })
  )
}
