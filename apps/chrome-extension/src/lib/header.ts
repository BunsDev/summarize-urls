export function buildIdleSubtitle({
  inputSummary,
}: {
  inputSummary?: string | null
}): string {
  return typeof inputSummary === 'string' ? inputSummary.trim() : ''
}
