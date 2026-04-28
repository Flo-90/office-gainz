type SupabaseLikeError = {
  message?: string
} | null | undefined

export function formatSupabaseErrorMessage(
  error: SupabaseLikeError,
): string {
  const message = error?.message ?? 'Unexpected Supabase error.'

  if (message.includes('Unsupported provider: provider is not enabled')) {
    return 'Google sign-in is not enabled in the Supabase project from your .env. Enable Google under Authentication > Providers and make sure the project URL and anon key point to that same project.'
  }

  if (
    message.includes('schema cache') &&
    /public\.(users|exercises|entries)/.test(message)
  ) {
    return 'The Supabase project from your .env is missing the app tables. Run the SQL from supabase/schema.sql in the Supabase SQL Editor for that same project, then refresh the app.'
  }

  return message
}