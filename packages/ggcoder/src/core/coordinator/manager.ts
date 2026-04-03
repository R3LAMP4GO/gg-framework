/**
 * Coordinator Manager — tracks worker agents and their lifecycle.
 */

import crypto from "node:crypto";
import { log } from "../logger.js";
import type { CoordinatorState, TaskNotification, WorkerAgent, WorkerStatus } from "./types.js";

export class CoordinatorManager {
  private state: CoordinatorState = {
    active: false,
    workers: new Map(),
    phase: "idle",
  };

  activate(): void {
    this.state.active = true;
    log("INFO", "coordinator", "Coordinator mode activated");
  }

  deactivate(): void {
    this.state.active = false;
    this.state.workers.clear();
    this.state.phase = "idle";
  }

  get isActive(): boolean {
    return this.state.active;
  }

  get phase(): CoordinatorState["phase"] {
    return this.state.phase;
  }

  setPhase(phase: CoordinatorState["phase"]): void {
    this.state.phase = phase;
    log("INFO", "coordinator", `Phase: ${phase}`);
  }

  /** Register a new worker when subagent is spawned */
  registerWorker(task: string, toolCallId?: string): string {
    const id = `worker-${crypto.randomUUID().slice(0, 8)}`;
    const worker: WorkerAgent = {
      id,
      task,
      status: "running",
      toolCallId,
      startedAt: Date.now(),
    };
    this.state.workers.set(id, worker);
    log("INFO", "coordinator", `Worker ${id} registered: ${task.slice(0, 60)}`);
    return id;
  }

  /** Update worker status when subagent completes */
  completeWorker(idOrToolCallId: string, result: string, tokenUsage?: { input: number; output: number }): void {
    const worker = this.findWorker(idOrToolCallId);
    if (!worker) return;
    worker.status = "completed";
    worker.result = result;
    worker.completedAt = Date.now();
    if (tokenUsage) worker.tokenUsage = tokenUsage;
    log("INFO", "coordinator", `Worker ${worker.id} completed (${this.formatDuration(worker)})`);
  }

  /** Mark worker as failed */
  failWorker(idOrToolCallId: string, error: string): void {
    const worker = this.findWorker(idOrToolCallId);
    if (!worker) return;
    worker.status = "failed";
    worker.result = error;
    worker.completedAt = Date.now();
    log("WARN", "coordinator", `Worker ${worker.id} failed: ${error.slice(0, 100)}`);
  }

  /** Kill a running worker */
  killWorker(idOrToolCallId: string): void {
    const worker = this.findWorker(idOrToolCallId);
    if (!worker || worker.status !== "running") return;
    worker.status = "killed";
    worker.completedAt = Date.now();
    log("INFO", "coordinator", `Worker ${worker.id} killed`);
  }

  /** Get all workers */
  getWorkers(): WorkerAgent[] {
    return [...this.state.workers.values()];
  }

  /** Get workers by status */
  getWorkersByStatus(status: WorkerStatus): WorkerAgent[] {
    return this.getWorkers().filter((w) => w.status === status);
  }

  /** Check if all workers are done (completed, failed, or killed) */
  allWorkersDone(): boolean {
    return this.getWorkers().every((w) => w.status !== "running" && w.status !== "pending");
  }

  /** Build a task notification from a completed worker (CC format) */
  buildNotification(worker: WorkerAgent): TaskNotification {
    return {
      taskId: worker.id,
      status: worker.status === "completed" ? "completed" : "failed",
      summary: worker.task,
      results: worker.result,
    };
  }

  /** Format all completed worker results for the coordinator */
  formatWorkerResults(): string {
    const completed = this.getWorkers().filter((w) => w.status !== "running" && w.status !== "pending");
    if (completed.length === 0) return "No workers have completed yet.";

    return completed
      .map((w) => {
        const status = w.status === "completed" ? "✓" : "✗";
        const duration = this.formatDuration(w);
        return `${status} ${w.id} (${duration}): ${w.task}\n${w.result ?? "(no output)"}`;
      })
      .join("\n\n---\n\n");
  }

  /** Get summary stats */
  getSummary(): { total: number; running: number; completed: number; failed: number } {
    const workers = this.getWorkers();
    return {
      total: workers.length,
      running: workers.filter((w) => w.status === "running").length,
      completed: workers.filter((w) => w.status === "completed").length,
      failed: workers.filter((w) => w.status === "failed" || w.status === "killed").length,
    };
  }

  private findWorker(idOrToolCallId: string): WorkerAgent | undefined {
    // Try by id first, then by toolCallId
    return (
      this.state.workers.get(idOrToolCallId) ??
      [...this.state.workers.values()].find((w) => w.toolCallId === idOrToolCallId)
    );
  }

  private formatDuration(worker: WorkerAgent): string {
    if (!worker.startedAt) return "?";
    const end = worker.completedAt ?? Date.now();
    const ms = end - worker.startedAt;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
}
