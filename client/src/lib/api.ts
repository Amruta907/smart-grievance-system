import { Category, Grievance, Role, User } from "../types";

const jsonHeaders = { "Content-Type": "application/json" };
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export function apiUrl(path: string): string {
  if (!API_BASE) return path;
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export function resolveAssetUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE) return path;
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function login(email: string, password: string, role: Role): Promise<{ token: string; user: User }> {
  const response = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ email, password, role })
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Login failed");
  return payload;
}

export async function register(name: string, email: string, password: string): Promise<{ token: string; user: User }> {
  const response = await fetch(apiUrl("/api/auth/register"), {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ name, email, password })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Registration failed");
  return payload;
}

export async function listGrievances(token: string): Promise<Grievance[]> {
  const response = await fetch(apiUrl("/api/grievances"), {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return [];
  return response.json();
}

export async function listMapMarkers(token: string): Promise<Grievance[]> {
  const response = await fetch(apiUrl("/api/map/markers"), {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return [];
  return response.json();
}

export async function listMyGrievances(token: string): Promise<Grievance[]> {
  const response = await fetch(apiUrl("/api/grievances/my"), {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return [];
  return response.json();
}

export async function listCategories(): Promise<Category[]> {
  const response = await fetch(apiUrl("/api/categories"));
  if (!response.ok) return [];
  return response.json();
}

export async function createGrievance(
  token: string,
  payload: { categoryId: number; title: string; description: string; location: string; latitude?: number; longitude?: number }
) {
  const response = await fetch(apiUrl("/api/grievances"), {
    method: "POST",
    headers: { ...jsonHeaders, Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? "Failed to create grievance");
  return json;
}

export async function submitComplaint(
  token: string,
  payload: {
    categoryId: number;
    fullName: string;
    email: string;
    mobile: string;
    description: string;
    location: string;
    latitude?: number;
    longitude?: number;
    photos: File[];
  }
) {
  const body = new FormData();
  body.append("categoryId", String(payload.categoryId));
  body.append("fullName", payload.fullName);
  body.append("email", payload.email);
  body.append("mobile", payload.mobile);
  body.append("description", payload.description);
  body.append("location", payload.location);
  if (payload.latitude !== undefined) body.append("latitude", String(payload.latitude));
  if (payload.longitude !== undefined) body.append("longitude", String(payload.longitude));
  for (const file of payload.photos) {
    body.append("photos", file);
  }

  const response = await fetch(apiUrl("/api/complaints"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? "Failed to submit complaint");
  return json;
}

export async function trackComplaintById(token: string, ticket: string): Promise<Grievance & { tracking_stage: string }> {
  const response = await fetch(apiUrl(`/api/grievances/track/${encodeURIComponent(ticket)}`), {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? "Failed to track complaint");
  return json;
}

export async function getAuthorityComplaint(token: string, id: number) {
  const response = await fetch(apiUrl(`/api/authority/grievances/${id}`), {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? "Failed to fetch complaint details");
  return json as Grievance & {
    citizen_name: string;
    citizen_email: string;
    citizen_phone: string | null;
    assigned_department: string | null;
    images_json: string | null;
    created_at: string;
  };
}

export async function updateAuthorityComplaintStatus(token: string, id: number, status: "accepted" | "in_progress" | "closed") {
  const response = await fetch(apiUrl(`/api/authority/grievances/${id}/status`), {
    method: "PATCH",
    headers: { ...jsonHeaders, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status })
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? "Failed to update complaint status");
  return json;
}
