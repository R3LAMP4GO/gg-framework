/**
 * Context for Ctrl+O tool output expansion toggle.
 * When true, ToolExecution shows all output lines instead of truncating.
 */
import { createContext, useContext } from "react";

const ExpandOutputContext = createContext(false);

export const ExpandOutputProvider = ExpandOutputContext.Provider;

export function useExpandOutput(): boolean {
  return useContext(ExpandOutputContext);
}
