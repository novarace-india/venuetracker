export interface Event {
  id: string;
  name: string;
  timezone: string;
  starts_at: string | null;
  email_subject: string;
  email_body: string;
}
export interface Participant {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  ticket_type: string;
  company: string;
  active: boolean;
  metadata: Record<string, string>;
}
export interface Gate {
  id: string;
  name: string;
  max_collections: number;
  requires: string[];
}
export interface Device {
  id: string;
  name: string;
  gate_name: string;
  revoked: number;
  last_seen: string | null;
}
export interface Collection {
  id: string;
  gate_name: string;
  created_at: string;
  undone_at: string | null;
  undo_reason: string | null;
}
export interface Activity {
  undone_at?: string | null;
  undo_reason?: string | null;
  id: string;
  full_name: string | null;
  gate_name: string;
  status: string;
  message: string;
  created_at: string;
  manual: number;
  reason?: string;
}
export interface Dashboard {
  participants: { total: number; active: number };
  gates: (Gate & { collections: number; people: number })[];
  activity: Activity[];
  emails: { status: string; count: number }[];
}
export interface EmailJob {
  id: string;
  full_name: string;
  email: string;
  status: string;
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
}
