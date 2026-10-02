/**
 * The four problems that block printing, in the order they are listed everywhere (tiles, counts, summaries), and what each
 * is called. One place, so a rename is one edit. Marks, colours and sentences stay with the code that draws them.
 */
export const PROBLEM_KINDS = ["hole", "double", "leftover", "license"] as const;
export type ProblemKind = (typeof PROBLEM_KINDS)[number];

export const PROBLEM_NAME: Record<ProblemKind, string> = {
  hole: "No coverage",
  double: "Two places",
  leftover: "Name on a closed day",
  license: "Not licensed",
};
