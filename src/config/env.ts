function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) {
    return fallback;
  }
  return value.trim().toLowerCase() === "true";
}

export function getEnableAdminBcc(): boolean {
  return parseBoolean(process.env.ENABLE_ADMIN_BCC, false);
}

export function getAdminBccEmail(): string | null {
  const value = process.env.ADMIN_BCC_EMAIL?.trim().toLowerCase();
  return value ? value : null;
}
