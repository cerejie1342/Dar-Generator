export interface Signatory {
  name: string;
  title: string;
}

export interface SupportFunction {
  id: string;
  /** Left-hand duty text, e.g. "Good Governance" */
  name: string;
  /** One sub-row per Minor Final Output */
  mfos: string[];
}

export interface Settings {
  // Profile
  pbeName: string;
  positionTitle: string;
  department: string;
  unit: string;
  supervisor: string;

  // Organization header
  orgName: string;
  orgAddress: string;
  reportTitle: string;

  // Core function row
  coreDuty: string;
  coreMfo: string;

  // Support function rows
  supportFunctions: SupportFunction[];
  /** Row number printed beside the first support function (official form starts at 5) */
  supportStartNumber: number;

  // Signatories
  preparedBy: Signatory;
  confirmedBy: Signatory;
  notedBy: Signatory;

  // Credentials
  githubToken: string;
  googleClientId: string;
  geminiApiKey: string;

  /** Repos + branches remembered as the default selection for new sessions. */
  defaultSelections: RepoSelection[];
}

export interface Repo {
  fullName: string;
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
}

export interface RepoSelection {
  fullName: string;
  /** Commits are pulled from every listed branch and deduplicated by SHA. */
  branches: string[];
}

export interface CommitFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  /** Unified diff for this file, truncated by the API for very large changes. */
  patch?: string;
}

export interface Commit {
  sha: string;
  repo: string;
  message: string;
  /** ISO timestamp of the commit (author date) */
  date: string;
  url: string;
  authorLogin?: string;
  /** Populated by fetchCommitFiles(); this is what the summary is written from. */
  files?: CommitFile[];
}

/** One column of the generated DAR: a single attendance date. */
export interface DayRow {
  /** yyyy-MM-dd */
  date: string;
  commits: Commit[];
  accomplishment: string;
}
