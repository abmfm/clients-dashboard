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

/** Only two kinds of shoot exist. */
export type SessionKind = "video" | "photo";
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
  package_id: string | null;
  contract_start: string | null;
  contract_months: number;
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
  kind: SessionKind | null;
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
  kind: SessionKind | null;
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
  /** English fallback, kept for rows created before templates existed. */
  title: string;
  message: string;
  /** Key into the notify dictionary, so the text renders in the reader's language. */
  template: string | null;
  params: Record<string, string | number> | null;
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

/** All counts are for the CURRENT calendar month; the allowance resets on the 1st. */
export interface ClientStats {
  video_allowance: number;
  photo_allowance: number;
  video_used: number;
  photo_used: number;
  video_left: number;
  photo_left: number;
  total_sessions: number;
  pending_requests: number;
  pending_bookings: number;
  completed: number;
  in_progress: number;
}

export interface PackageRow {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  video_per_month: number;
  photo_per_month: number;
  contract_months: number;
  is_active: boolean;
}

export interface ContractMonth {
  n: number;
  starts_on: string;
  video_used: number;
  photo_used: number;
}

export interface ClientContract {
  package: string | null;
  package_code: string | null;
  video_per_month: number;
  photo_per_month: number;
  contract_start: string | null;
  contract_months: number;
  current_month: number | null;
  months: ContractMonth[];
}
