import type { ParsedTask } from "./TaskModel"
import { openTasks, sortTasks, sortTasksByGroup } from "./TaskQuery"

export const renderTaskList = (tasks: ReadonlyArray<ParsedTask>): string => {
  const sorted = sortTasks(tasks)
  if (sorted.length === 0) {
    return "No tasks found."
  }
  return sorted.map(renderTaskLine).join("\n")
}

export const renderGroupedOpenTasks = (tasks: ReadonlyArray<ParsedTask>): string => {
  const opened = sortTasksByGroup(openTasks(tasks))
  if (opened.length === 0) {
    return "No open tasks found."
  }

  const lines: Array<string> = []
  let currentGroup = ""
  for (const task of opened) {
    const group = `${task.area ?? "No area"} / ${task.project ?? "No project"}`
    if (group !== currentGroup) {
      if (lines.length > 0) {
        lines.push("")
      }
      lines.push(group)
      currentGroup = group
    }
    lines.push(`  ${renderTaskLine(task)}`)
  }

  return lines.join("\n")
}

export const renderTaskLine = (task: ParsedTask): string =>
  `${renderDateLabel(task)} | ${renderScope(task)} | ${task.text} (${task.source.path}:${task.source.lineNumber})`

export const renderRepeatTaskLine = (task: ParsedTask): string => {
  const scheduled = task.scheduled ?? "unscheduled"
  return `${scheduled} | ${task.repeat ?? "repeat"} | ${renderScope(task)} | ${task.text} (${task.source.path}:${task.source.lineNumber})`
}

const renderDateLabel = (task: ParsedTask): string => {
  if (task.due !== undefined) {
    return `${task.due} due`
  }
  if (task.scheduled !== undefined) {
    return `${task.scheduled} scheduled`
  }
  return "undated"
}

const renderScope = (task: ParsedTask): string => {
  const area = task.area ?? "No area"
  const project = task.project ?? "No project"
  return `${area} / ${project}`
}
