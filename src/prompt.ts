import type { DependencyCase } from './types.js';

/**
 * The three actions the code can take. The descriptions double as the Choice
 * criteria sent to Jev, so they must separate the options without revealing which
 * class a case belongs to.
 */
export const CRITERIA: Record<string, string> = {
  AUTO_MERGE:
    'The pre-merge evidence (release notes, version delta, dependency role, CI status) is strong enough that merging now without human review is the safe action.',
  HOLD:
    'Merging now is not safe, but the remaining doubt is about waiting for more pre-merge evidence (for example release age or checks still running), not about a substantive breaking risk.',
  REQUIRE_REVIEW:
    'A human should inspect this update before merge because the evidence indicates a material breaking, behavioural, or security risk.',
};

export const instruction = `You are deciding what a dependency-bot should do with ONE dependency-update pull request, using only pre-merge information.

Choose the safest action:
- AUTO_MERGE: pre-merge evidence supports merging automatically, with no human review.
- HOLD: do not merge yet, but the update may become safe after waiting for more pre-merge evidence.
- REQUIRE_REVIEW: a human must inspect it before merge.

Judge the substantive risk of the update itself, not whether the PR happens to be merged. Missing evidence is not favourable evidence: if the release notes or version change plausibly indicate breaking or behavioural change, prefer REQUIRE_REVIEW over AUTO_MERGE. Treat major version changes, removed/renamed APIs, changed defaults, new runtime requirements, and security-sensitive changes conservatively. Do not invent facts that are not in the state.`;

/**
 * The exact pre-merge projection sent to a model. This whitelist is the single
 * source of truth for leakage control: nothing derived from the post-merge outcome
 * is ever included, and the audit script checks this projection.
 */
export function decisionState(c: DependencyCase) {
  return {
    project: {
      repository: c.repo,
      ecosystem: c.ecosystem,
      packageManager: c.packageManager,
    },
    update: {
      dependency: c.dependency,
      previousVersion: c.previousVersion,
      newVersion: c.newVersion,
      updateType: c.updateType,
      securityUpdate: c.securityUpdate,
    },
    pullRequest: {
      title: c.title,
      body: c.body,
      manifestDiff: c.manifestDiff,
    },
    dependencyReleaseNotes: c.changelog,
    preMergeChecks: c.checks,
  };
}

export function decisionStateJson(c: DependencyCase): string {
  return JSON.stringify(decisionState(c), null, 1);
}
