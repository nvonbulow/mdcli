import { Array as Arr, Order } from "effect"
import { IsoDate, ParsedTask, ValidationProblem, WeekWindow } from "./TaskModel"
import { isIsoDate } from "./TaskParser"

const dateFieldNames = ["scheduled", "due", "completed"] as const

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

export const validateTasks = (tasks: ReadonlyArray<ParsedTask>): ReadonlyArray<ValidationProblem> => {
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

export const weekWindow = (start: IsoDate): WeekWindow => new WeekWindow({ start, end: addDays(start, 6) })

export const isoDateFromEpochMillis = (millis: number): IsoDate => {
  const days = Math.floor(millis / 86_400_000)
  return isoDateFromEpochDay(days)
}

export const addDays = (date: IsoDate, days: number): IsoDate => {
  let year = Number(date.slice(0, 4))
  let month = Number(date.slice(5, 7))
  let day = Number(date.slice(8, 10)) + days

  while (day > daysInMonth(year, month)) {
    day -= daysInMonth(year, month)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }

  while (day < 1) {
    month -= 1
    if (month < 1) {
      month = 12
      year -= 1
    }
    day += daysInMonth(year, month)
  }

  return formatIsoDate(year, month, day)
}

const dateInWindow = (date: IsoDate | undefined, window: WeekWindow): boolean =>
  date !== undefined && Order.String(date, window.start) >= 0 && Order.String(date, window.end) <= 0

const isoDateFromEpochDay = (epochDay: number): IsoDate => {
  let day = epochDay
  let year = 1970

  if (day >= 0) {
    while (day >= daysInYear(year)) {
      day -= daysInYear(year)
      year += 1
    }
  } else {
    while (day < 0) {
      year -= 1
      day += daysInYear(year)
    }
  }

  let month = 1
  while (day >= daysInMonth(year, month)) {
    day -= daysInMonth(year, month)
    month += 1
  }

  return formatIsoDate(year, month, day + 1)
}

const formatIsoDate = (year: number, month: number, day: number): IsoDate =>
  `${pad4(year)}-${pad2(month)}-${pad2(day)}` as IsoDate

const pad2 = (value: number): string => (value < 10 ? `0${value}` : `${value}`)
const pad4 = (value: number): string => {
  if (value >= 1000) {
    return `${value}`
  }
  if (value >= 100) {
    return `0${value}`
  }
  if (value >= 10) {
    return `00${value}`
  }
  return `000${value}`
}

const daysInYear = (year: number): number => (isLeapYear(year) ? 366 : 365)
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
