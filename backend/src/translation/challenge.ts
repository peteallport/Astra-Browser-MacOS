/** Recognized interstitial titles cannot be published or served as source pages. */
export function isChallengeTitle(title: string): boolean {
  return /^(?:just a moment|access denied|verify (?:that )?you are human|verifying (?:(?:your|the) )?browser|checking (?:(?:your|the) )?browser|sign in to continue|attention required|security verification)(?:\b|[.!…])/i.test(title.trim());
}
