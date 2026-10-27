type DelegationTask = {
  task_id: string
  agent_name: string
  parent_id: string | null
  status: string
  outcome: string | null
  background: boolean
  output: string
}

export type DelegationSnapshot = {
  run_id: string
  active: boolean
  tasks: DelegationTask[]
}

export type DelegationControlBody = {
  run_id: string
  action: "steer" | "stop"
  text?: string
}
