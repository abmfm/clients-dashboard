export type UserRole = "admin" | "client";

export type WorkStatus =
  | "pending_approval"
  | "approved"
  | "scheduled"
  | "shooting"
  | "editing"
  | "review"
  | "completed"
  | "cancelled";

export type RequestStatus = "pending" | "approved" | "rejected";
export type RescheduleStatus = "none" | "pending" | "approved" | "rejected";
export type WorkType = "photos" | "video" | "edit" | "album" | "other";
export type AccountStatus = "active" | "suspended";

export interface Profile {
  id: string;
  username: string;
  login_email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  avatar_url: string | null;
  package_name: string | null;
  session_limit: number;
  contract_notes: string | null;
  status: AccountStatus;
  must_change_password: boolean;
  created_at: string;
}

export interface SessionRow {
  id: string;
  client_id: string;
  request_id: string | null;
  title: string;
  session_type: string;
  scheduled_at: string | null;
  duration_mins: number | null;
  location: string | null;
  status: WorkStatus;
  notes: string | null;
  is_extra: boolean;
  google_event_id: string | null;
  /** The project this shoot belongs to. */
  project_id: string | null;
  progress: number;
  reschedule_status: RescheduleStatus;
  reschedule_requested_for: string | null;
  reschedule_note: string | null;
  reschedule_requested_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  client?: Pick<Profile, "id" | "full_name" | "username"> | null;
  projects?: { count: number }[];
}

/**
 * A project groups one client's sessions. Sessions sit inside it, and
 * `progress` is the average of theirs rather than something typed by hand.
 */
export interface Project {
  id: string;
  session_id: string | null;
  client_id: string;
  name: string;
  type: WorkType;
  /** Free-text name used when `type` is "other". */
  type_label: string | null;
  status: WorkStatus;
  progress: number;
  delivery_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  client?: Pick<Profile, "id" | "full_name" | "username"> | null;
  /** The shoots filed under this project. */
  sessions?: SessionRow[];
}

export interface SessionRequest {
  id: string;
  client_id: string;
  title: string;
  /** false = booking one of the sessions included in the contract. */
  is_extra: boolean;
  session_type: string;
  preferred_date: string | null;
  preferred_time: string | null;
  location: string | null;
  notes: string | null;
  status: RequestStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  /** Set when the session created from this request was cancelled. */
  cancelled_at: string | null;
  created_at: string;
  client?: Pick<Profile, "id" | "full_name" | "username"> | null;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  link: string | null;
  kind: "info" | "success" | "warning";
  is_read: boolean;
  created_at: string;
}

export interface AdminStats {
  clients: number;
  active_clients: number;
  sessions: number;
  active_projects: number;
  pending_requests: number;
  completed: number;
}

export interface ClientStats {
  session_limit: number;
  /** Booked sessions + package bookings still awaiting approval. */
  sessions_used: number;
  sessions_left: number;
  total_sessions: number;
  pending_requests: number;
  pending_bookings: number;
  completed: number;
  in_progress: number;
}
