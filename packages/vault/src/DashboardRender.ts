import type { DashboardRenderOptions } from "./DashboardModel"
import type { IsoDate, ParsedTask } from "./TaskModel"
import { openTasks, sortTasksByGroup, todayTasks, weekTasks, weekWindow } from "./TaskQuery"
import { renderTaskLine } from "./TaskRender"

export const renderDashboard = (tasks: ReadonlyArray<ParsedTask>, options: DashboardRenderOptions): string => {
  switch (options.name) {
    case "today":
      return options.date === undefined
        ? renderConfigurationProblem("Today", "Missing dashboard date.")
        : renderTodayDashboard(tasks, options.date)
    case "week":
      return options.start === undefined
        ? renderConfigurationProblem("This Week", "Missing dashboard start.")
        : renderWeekDashboard(tasks, options.start)
    case "open":
      return renderOpenDashboard(tasks)
  }
}

export const renderTodayDashboard = (tasks: ReadonlyArray<ParsedTask>, date: IsoDate): string => {
  const items = todayTasks(tasks, date)
  return renderTaskDashboard(
    `Today — ${date}`,
    `${items.length} open task${plural(items.length)} scheduled or due today.`,
    items
  )
}

export const renderWeekDashboard = (tasks: ReadonlyArray<ParsedTask>, start: IsoDate): string => {
  const window = weekWindow(start)
  const items = weekTasks(tasks, window.start)
  return renderTaskDashboard(
    `This Week — ${window.start} through ${window.end}`,
    `${items.length} open task${plural(items.length)} scheduled or due in this window.`,
    items
  )
}

export const renderOpenDashboard = (tasks: ReadonlyArray<ParsedTask>): string => {
  const items = sortTasksByGroup(openTasks(tasks))
  const lines = [`# All Open Tasks`, "", `${items.length} open task${plural(items.length)}.`, ""]
  let currentArea = ""
  let currentProject = ""

  for (const task of items) {
    const area = task.area ?? "No area"
    const project = task.project ?? "No project"
    if (area !== currentArea) {
      lines.push(`## ${area}`, "")
      currentArea = area
      currentProject = ""
    }
    if (project !== currentProject) {
      lines.push(`### ${project}`, "")
      currentProject = project
    }
    lines.push(`- ${renderTaskLine(task)}`)
  }

  if (items.length === 0) {
    lines.push("No open tasks found.")
  }

  return trimTrailingBlankLines(lines).join("\n")
}

const renderTaskDashboard = (title: string, summary: string, tasks: ReadonlyArray<ParsedTask>): string => {
  const lines = [`# ${title}`, "", summary, ""]

  if (tasks.length === 0) {
    lines.push("No matching tasks found.")
    return lines.join("\n")
  }

  for (const task of tasks) {
    lines.push(`- ${renderTaskLine(task)}`)
  }

  return lines.join("\n")
}

const renderConfigurationProblem = (title: string, message: string): string => `# ${title}\n\n${message}`

const plural = (count: number): string => (count === 1 ? "" : "s")

const trimTrailingBlankLines = (lines: Array<string>): Array<string> => {
  let end = lines.length
  while (end > 0 && lines[end - 1] === "") {
    end -= 1
  }
  return lines.slice(0, end)
}
