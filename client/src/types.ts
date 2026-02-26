export type Role = "citizen" | "authority";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface Grievance {
  id: number;
  ticket_number: string;
  title: string;
  description: string;
  location: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "submitted" | "under_review" | "in_progress" | "awaiting_confirmation" | "closed" | "escalated" | "reopened";
  complaint_status?: "pending" | "accepted" | "in_progress" | "closed";
  latitude: number | null;
  longitude: number | null;
  category_name?: string;
}

export interface Category {
  id: number;
  name: string;
}
