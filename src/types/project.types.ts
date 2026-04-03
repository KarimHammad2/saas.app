export interface StructuredProjectData {
  goals: string[];
  tasks: string[];
  risks: string[];
  notes: string[];
  decisions: string[];
}

export interface TimelineEntry {
  timestamp: string;
  summary: string;
}

export interface ProjectStateDocument {
  overview: string;
  goals: string[];
  tasks: string[];
  risks: string[];
  notes: string[];
  decisions: string[];
  timeline: TimelineEntry[];
  history: Array<{
    timestamp: string;
    update: StructuredProjectData;
  }>;
}

export interface IncomingEmailPayload {
  senderEmail: string;
  subject: string;
  body: string;
  rawInput?: string;
}

export interface UserRecord {
  id: string;
  email: string;
  created_at: string;
}

export interface ProjectRecord {
  id: string;
  user_id: string;
  owner_email: string;
  name: string;
  created_at: string;
}

export interface ProjectUpdateRecord {
  id: string;
  project_id: string;
  raw_input: string;
  structured_data: StructuredProjectData;
  created_at: string;
}

export function createEmptyStructuredData(): StructuredProjectData {
  return {
    goals: [],
    tasks: [],
    risks: [],
    notes: [],
    decisions: [],
  };
}

export function createEmptyProjectState(): ProjectStateDocument {
  return {
    overview: "",
    goals: [],
    tasks: [],
    risks: [],
    notes: [],
    decisions: [],
    timeline: [],
    history: [],
  };
}
