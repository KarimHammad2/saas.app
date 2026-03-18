import { getSupabaseAdminClient } from "@/lib/supabase";

export interface UserRecord {
  id: string;
  email: string;
  created_at: string;
}

export async function getOrCreateUser(email: string): Promise<UserRecord> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error("Email is required to get or create user.");
  }

  const supabase = getSupabaseAdminClient();

  const { data: existingUser, error: findError } = await supabase
    .from("users")
    .select("id, email, created_at")
    .eq("email", normalizedEmail)
    .maybeSingle<UserRecord>();

  if (findError) {
    throw new Error(`Failed to find user: ${findError.message}`);
  }

  if (existingUser) {
    return existingUser;
  }

  const { data: createdUser, error: createError } = await supabase
    .from("users")
    .insert({ email: normalizedEmail })
    .select("id, email, created_at")
    .single<UserRecord>();

  if (createError || !createdUser) {
    throw new Error(`Failed to create user: ${createError?.message ?? "Unknown error"}`);
  }

  return createdUser;
}
