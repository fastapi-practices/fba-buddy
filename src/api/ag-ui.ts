import {
  EventSchemas,
  RunAgentInputSchema,
  type AGUIEvent,
  type RunAgentInput,
} from "@ag-ui/core"

/** 解析并锁定 AG-UI 线协议事件，非法 SSE 帧直接失败 */
export function parseAgUiEvent(value: unknown): AGUIEvent {
  return EventSchemas.parse(value)
}

/** 解析并锁定 AG-UI RunAgentInput，请求端只发送协议声明的字段 */
export function parseRunAgentInput(value: unknown): RunAgentInput {
  return RunAgentInputSchema.parse(value)
}
