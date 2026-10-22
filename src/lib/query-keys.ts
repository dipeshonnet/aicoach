export const queryKeys = {
  overview: ["overview"] as const,
  scenario: (id: string | undefined) => ["scenario", id] as const,
  attempt: (id: string | undefined) => ["attempt", id] as const,
};
