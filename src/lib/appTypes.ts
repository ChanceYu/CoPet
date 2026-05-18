export type PetStateId =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

export type PetState = {
  id: PetStateId;
  row: number;
  frames: number;
  durationMs: number;
};

export type PetSummary = {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  frameWidth: number;
  frameHeight: number;
  gridColumns: number;
  gridRows: number;
  builtIn: boolean;
  spritePath: string;
};

export type Locale = "en-US" | "zh-CN";
export type LocalePreference = "system" | Locale;

export type AppState = {
  currentPetId: string;
  locale: Locale;
  localePreference: LocalePreference;
  pets: PetSummary[];
  onboardingComplete: boolean;
  petWindowSize: PetWindowSize;
};

export type PetWindowSize = number;

export type PetImportResult = {
  imported: number;
  skipped: number;
  pets: PetSummary[];
};

export type DerivedPetState = {
  state: PetStateId;
  sinceMs: number;
  idleAfterMs: number | null;
};

export type AgentMessage = {
  agent: string;
  displayName: string;
  text: string;
  updatedAtMs: number;
};

export type RuntimeUpdate = {
  currentState: DerivedPetState;
  messages: AgentMessage[];
};

export type RuntimeStatus = {
  port: number;
  endpoint: string;
  currentState: DerivedPetState;
  messages: AgentMessage[];
  acceptedEvents: number;
  rejectedEvents: number;
};

export type AdapterSummary = {
  id: string;
  displayName: string;
  configPath: string;
  installed: boolean;
  healthy: boolean;
  message: string;
};

export type AdapterOperationResult = {
  adapter: AdapterSummary;
};
