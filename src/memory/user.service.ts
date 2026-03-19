import { getSupabaseAdminClient } from "@/lib/supabase";
import type { UserRecord } from "@/src/types/project.types";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("A valid email is required.");
  }
  return normalized;
}

export class UserService {
  private readonly supabase = getSupabaseAdminClient();

  async createUser(email: string): Promise<UserRecord> {
    const normalized = assertEmail(email);
    const { data, error } = await this.supabase
      .from("users")
      .insert({ email: normalized })
      .select("id, email, created_at")
      .single<UserRecord>();

    if (error || !data) {
      throw new Error(`Failed to create user: ${error?.message ?? "Unknown error"}`);
    }

    return data;
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const normalized = assertEmail(email);
    const { data, error } = await this.supabase
      .from("users")
      .select("id, email, created_at")
      .eq("email", normalized)
      .maybeSingle<UserRecord>();

    if (error) {
      throw new Error(`Failed to fetch user by email: ${error.message}`);
    }

    return data ?? null;
  }
}
