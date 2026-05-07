export type InputType = "ortto_id" | "email" | "hxt_id";

export interface Contact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  hxtId: string;
  linkedinUrl: string;
}

export interface Activity {
  id: string;
  field_id: string;
  created_at: string;
  attr: Record<string, unknown>;
}

export interface DateGroup {
  date: string;
  activities: Activity[];
}
