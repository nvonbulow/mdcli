import { Array as Arr, Order } from "effect"
import * as Effect from "effect/Effect"
import { addDays, isoDateFromEpochMillis, weekWindow } from "./CalendarService"
import { IsoDate, ParsedTask, ValidationProblem, WeekWindow } from "./TaskModel"
import { TaskValidator } from "./TaskValidator"
export { addDays, isoDateFromEpochMillis, weekWindow }

export const openTasks = (tasks: ReadonlyArray<ParsedTask>): ReadonlyArray<ParsedTask> =>
  sortTasks(tasks.filter((task) => !task.done))

export const todayTasks = (tasks: ReadonlyArray<ParsedTask>, date: IsoDate): ReadonlyArray<ParsedTask> =>
  openTasks(tasks).filter((task) => task.scheduled === date || task.due === date)

export const weekTasks = (tasks: ReadonlyArray<ParsedTask>, start: IsoDate): ReadonlyArray<ParsedTask> => {
  const window = weekWindow(start)
  return openTasks(tasks).filter((task) => dateInWindow(task.scheduled, window) || dateInWindow(task.due, window))
}

export const dueTasks = (tasks: ReadonlyArray<ParsedTask>, date: IsoDate): ReadonlyArray<ParsedTask> =>
  openTasks(tasks).filter((task) => task.due !== undefined && Order.String(task.due, date) <= 0)

export const repeatingTasks = (tasks: ReadonlyArray<ParsedTask>): ReadonlyArray<ParsedTask> =>
  openTasks(tasks).filter((task) => task.repeat !== undefined)

export const validateTasks = (tasks: ReadonlyArray<ParsedTask>): ReadonlyArray<ValidationProblem> =>
  Effect.runSync(
    Effect.flatMap(TaskValidator, (validator) => validator.validate(tasks)).pipe(
      Effect.provide(TaskValidator.layerLive)
    )
  )

const optionalDateOrder: Order.Order<IsoDate | undefined> = Order.make((left, right) => {
  if (left === undefined && right === undefined) {
    return 0
  }
  if (left === undefined) {
    return 1
  }
  if (right === undefined) {
    return -1
  }
  return Order.String(left, right)
})

export const sortTasks = (tasks: ReadonlyArray<ParsedTask>): ReadonlyArray<ParsedTask> => Arr.sort(tasks, taskOrder)
export const sortTasksByGroup = (tasks: ReadonlyArray<ParsedTask>): ReadonlyArray<ParsedTask> =>
  Arr.sort(tasks, groupedTaskOrder)

export const taskOrder: Order.Order<ParsedTask> = Order.combineAll([
  Order.mapInput(optionalDateOrder, (task: ParsedTask) => task.due),
  Order.mapInput(optionalDateOrder, (task: ParsedTask) => task.scheduled),
  Order.mapInput(Order.String, (task: ParsedTask) => task.area ?? ""),
  Order.mapInput(Order.String, (task: ParsedTask) => task.project ?? ""),
  Order.mapInput(Order.String, (task: ParsedTask) => task.source.path),
  Order.mapInput(Order.Number, (task: ParsedTask) => task.source.lineNumber)
])
export const groupedTaskOrder: Order.Order<ParsedTask> = Order.combineAll([
  Order.mapInput(Order.String, (task: ParsedTask) => task.area ?? ""),
  Order.mapInput(Order.String, (task: ParsedTask) => task.project ?? ""),
  Order.mapInput(optionalDateOrder, (task: ParsedTask) => task.due),
  Order.mapInput(optionalDateOrder, (task: ParsedTask) => task.scheduled),
  Order.mapInput(Order.String, (task: ParsedTask) => task.source.path),
  Order.mapInput(Order.Number, (task: ParsedTask) => task.source.lineNumber)
])

const dateInWindow = (date: IsoDate | undefined, window: WeekWindow): boolean =>
  date !== undefined && Order.String(date, window.start) >= 0 && Order.String(date, window.end) <= 0
