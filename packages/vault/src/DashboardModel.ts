import { Schema } from "effect"
import { IsoDate, TaskViewName } from "./TaskModel"

export const DashboardName = TaskViewName
export type DashboardName = typeof DashboardName.Type

export class DashboardRenderOptions extends Schema.Class<DashboardRenderOptions>("@kb/vault-core/DashboardRenderOptions")({
  name: DashboardName,
  date: Schema.optionalKey(IsoDate),
  start: Schema.optionalKey(IsoDate)
}) {}
