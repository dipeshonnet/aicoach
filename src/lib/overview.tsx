import { createContext, useContext } from "react";
import type { Overview } from "../shared/types";

const OverviewContext = createContext<Overview | null>(null);
export const OverviewProvider = OverviewContext.Provider;

export function useOverview(): Overview {
  const overview = useContext(OverviewContext);
  if (!overview)
    throw new Error("useOverview must be used within an OverviewProvider.");
  return overview;
}
