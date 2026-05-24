import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { ParsedTask, ValidationProblem } from "./TaskModel"

export type TaskValidatorShape = {
  readonly validate: (tasks: ReadonlyArray<ParsedTask>) => Effect.Effect<ReadonlyArray<ValidationProblem>, never>
}

export class TaskValidator extends Context.Service<TaskValidator, TaskValidatorShape>()("@kb/vault/TaskValidator") {
  static readonly layerLive: Layer.Layer<TaskValidator> = Layer.effect(TaskValidator, makeTaskValidator())
}

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

const isIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

const daysInMonth = (year: number, month: number): number => {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28
    case 4:
    case 6:
    case 9:
    case 11:
      return 30
    default:
      return 31
  }
}

const isLeapYear = (year: number): boolean => year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0)

function makeTaskValidator(): Effect.Effect<TaskValidatorShape> {
  return Effect.sync(() =>
    TaskValidator.of({
      validate: Effect.fn("@kb/vault/TaskValidator.validate")((tasks: ReadonlyArray<ParsedTask>) =>
        Effect.succeed(validateTaskList(tasks))
      )
    })
  )
}
