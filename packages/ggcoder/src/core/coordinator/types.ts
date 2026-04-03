/** Worker agent states tracked by the coordinator */
export type WorkerStatus = "pending" | "running" | "completed" | "failed" | "killed";

/** A worker managed by the coordinator */
export interface WorkerAgent {
  id: string;
  task: string;
  status: WorkerStatus;
  toolCallId?: string;
  result?: string;
  startedAt?: number;
  completedAt?: number;
  tokenUsage?: { input: number; output: number };
}

/** Task notification from a completed worker */
export interface TaskNotification {
  taskId: string;
  status: "completed" | "failed";
  summary: string;
  results?: string;
}

/** Coordinator session state */
export interface CoordinatorState {
  active: boolean;
  workers: Map<string, WorkerAgent>;
  phase: "idle" | "research" | "implementation" | "verification";
}
