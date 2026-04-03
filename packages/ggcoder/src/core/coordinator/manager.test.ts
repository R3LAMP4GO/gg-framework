import { describe, it, expect, beforeEach } from "vitest";
import { CoordinatorManager } from "./manager.js";

describe("CoordinatorManager", () => {
  let manager: CoordinatorManager;

  beforeEach(() => {
    manager = new CoordinatorManager();
  });

  describe("activation", () => {
    it("starts inactive", () => {
      expect(manager.isActive).toBe(false);
    });

    it("activates and deactivates", () => {
      manager.activate();
      expect(manager.isActive).toBe(true);
      manager.deactivate();
      expect(manager.isActive).toBe(false);
    });
  });

  describe("phase tracking", () => {
    it("starts idle", () => {
      expect(manager.phase).toBe("idle");
    });

    it("transitions between phases", () => {
      manager.setPhase("research");
      expect(manager.phase).toBe("research");
      manager.setPhase("implementation");
      expect(manager.phase).toBe("implementation");
    });
  });

  describe("worker management", () => {
    it("registers a worker", () => {
      const _id = manager.registerWorker("Explore auth module", "tc-1");
      expect(_id).toMatch(/^worker-/);
      expect(manager.getWorkers()).toHaveLength(1);
      expect(manager.getWorkers()[0].status).toBe("running");
    });

    it("completes a worker by toolCallId", () => {
      manager.registerWorker("task", "tc-1");
      manager.completeWorker("tc-1", "Found 3 files");
      expect(manager.getWorkersByStatus("completed")).toHaveLength(1);
      expect(manager.getWorkersByStatus("completed")[0].result).toBe("Found 3 files");
    });

    it("fails a worker", () => {
      manager.registerWorker("task", "tc-2");
      manager.failWorker("tc-2", "timeout");
      expect(manager.getWorkersByStatus("failed")).toHaveLength(1);
    });

    it("kills a worker", () => {
      manager.registerWorker("task", "tc-3");
      manager.killWorker("tc-3");
      expect(manager.getWorkersByStatus("killed")).toHaveLength(1);
    });

    it("allWorkersDone returns true when all done", () => {
      manager.registerWorker("a", "tc-1");
      manager.registerWorker("b", "tc-2");
      expect(manager.allWorkersDone()).toBe(false);
      manager.completeWorker("tc-1", "done");
      expect(manager.allWorkersDone()).toBe(false);
      manager.failWorker("tc-2", "err");
      expect(manager.allWorkersDone()).toBe(true);
    });

    it("allWorkersDone returns true with no workers", () => {
      expect(manager.allWorkersDone()).toBe(true);
    });
  });

  describe("summary", () => {
    it("returns correct counts", () => {
      manager.registerWorker("a", "tc-1");
      manager.registerWorker("b", "tc-2");
      manager.registerWorker("c", "tc-3");
      manager.completeWorker("tc-1", "ok");
      manager.failWorker("tc-2", "err");

      const summary = manager.getSummary();
      expect(summary.total).toBe(3);
      expect(summary.running).toBe(1);
      expect(summary.completed).toBe(1);
      expect(summary.failed).toBe(1);
    });
  });

  describe("notifications", () => {
    it("builds task notification for completed worker", () => {
      manager.registerWorker("Search for patterns", "tc-1");
      manager.completeWorker("tc-1", "Found pattern in 5 files");

      const worker = manager.getWorkers()[0];
      const notif = manager.buildNotification(worker);
      expect(notif.status).toBe("completed");
      expect(notif.results).toBe("Found pattern in 5 files");
    });

    it("builds task notification for failed worker", () => {
      manager.registerWorker("task", "tc-1");
      manager.failWorker("tc-1", "timeout");

      const worker = manager.getWorkers()[0];
      const notif = manager.buildNotification(worker);
      expect(notif.status).toBe("failed");
    });
  });

  describe("formatWorkerResults", () => {
    it("formats completed workers", () => {
      manager.registerWorker("task A", "tc-1");
      manager.registerWorker("task B", "tc-2");
      manager.completeWorker("tc-1", "Result A");
      manager.failWorker("tc-2", "Error B");

      const results = manager.formatWorkerResults();
      expect(results).toContain("✓");
      expect(results).toContain("Result A");
      expect(results).toContain("✗");
      expect(results).toContain("Error B");
    });

    it("returns message when no workers completed", () => {
      expect(manager.formatWorkerResults()).toContain("No workers");
    });
  });

  describe("deactivate clears state", () => {
    it("clears workers and resets phase", () => {
      manager.activate();
      manager.setPhase("research");
      manager.registerWorker("task", "tc-1");
      manager.deactivate();

      expect(manager.getWorkers()).toHaveLength(0);
      expect(manager.phase).toBe("idle");
      expect(manager.isActive).toBe(false);
    });
  });
});
