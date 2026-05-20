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

export type PetInteractionSounds = {
  click?: string;
  doubleClick?: string;
  petted?: string;
  pettedSlow?: string;
  dragLand?: string;
};

export type PetAgentSounds = {
  thinking?: string;
  editing?: string;
  inspecting?: string;
  awaitingApproval?: string;
  celebrating?: string;
  failed?: string;
};

export type PetSounds = {
  interactionSounds?: PetInteractionSounds;
  agentSounds?: PetAgentSounds;
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
  sounds?: PetSounds;
};

export type Locale = "en-US" | "zh-CN";
export type LocalePreference = "system" | Locale;

export type AgentMessageDisplay = "all" | "latest";

export type CooldownStyle = "short" | "normal" | "lazy";

export type PetInteractionPrefs = {
  enableClickSounds: boolean;
  cooldownStyle: CooldownStyle;
};

export const defaultPetInteractionPrefs: PetInteractionPrefs = {
  enableClickSounds: false,
  cooldownStyle: "normal",
};

export type AppState = {
  currentPetId: string;
  locale: Locale;
  localePreference: LocalePreference;
  pets: PetSummary[];
  onboardingComplete: boolean;
  petWindowSize: PetWindowSize;
  agentMessageDisplay: AgentMessageDisplay;
  responsePaused: boolean;
  petInteractions: PetInteractionPrefs;
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
