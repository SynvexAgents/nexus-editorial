// Helpers consommés par les Code Nodes n8n et par les scripts CLI.
// Au runtime n8n cloud, les imports `franc-min` peuvent être indisponibles ;
// le test-collector script utilise ce package directement, et l'inline JS du
// Code Node n8n (cf. n8n-workflows/) embarque une heuristique simplifiée.
// Source de vérité : `normalizer.ts` et ses tests Vitest.

export * from './date-utils.js';
export * from './apify-mappers.js';
export * from './normalizer.js';
export * from './agents/editorial-analyst.js';
export { SYSTEM_PROMPT, SYSTEM_PROMPT_STATS } from './agents/system-prompt-builder.js';
export {
  type PostAnalysisEnriched,
  type TrendsInput,
  type TrendsResult,
  InsufficientVolumeError,
  synthesizeTrends,
} from './agents/linkedin-trends-synthesizer.js';
export {
  AGENT_4_SYSTEM_PROMPT,
  AGENT_4_SYSTEM_PROMPT_STATS,
} from './agents/agent-4-system-prompt.js';
export {
  type PostProcessStats as TrendsPostProcessStats,
  type PostProcessResult as TrendsPostProcessResult,
  postProcessTrends,
} from './agents/trends-post-processor.js';
// Agent 5 — InsuranceTrendsSynthesizer
export {
  type ClusterId,
  type ClusterDef,
  type ClusterWeekRange,
  CLUSTERS,
  CLUSTERS_BY_ID,
} from './agents/insurance-clusters.js';
export {
  type ClusterCallStats,
  type RunUsage,
  type SynthesizeInsuranceTrendsOptions,
  type SynthesizeInsuranceTrendsResult,
  type WeekRange,
  extractJsonArray,
  synthesizeInsuranceTrends,
} from './agents/insurance-trends-synthesizer.js';
export {
  type PostProcessStats as InsuranceTrendsPostProcessStats,
  type PostProcessOutput as InsuranceTrendsPostProcessOutput,
  type RawClusterResult,
  normalizeDate,
  postProcessInsuranceTrends,
} from './agents/insurance-trends-post-processor.js';
export {
  type UrlVerifyOptions,
  type UrlVerifyResult,
  verifyUrls,
} from './agents/url-verifier.js';
// Agent 6 — Angles Generator
export {
  AGENT_6_SYSTEM_PROMPT,
  AGENT_6_SYSTEM_PROMPT_STATS,
} from './agents/agent-6-system-prompt.js';
export {
  type AnglesInput,
  type AnglesResult,
  type GenerateAnglesOptions,
  type UsageSummary as AnglesUsageSummary,
  generateAngles,
} from './agents/angles-generator.js';
export {
  type AngleValidationFlag,
  type AnglesValidationReport,
  type PostProcessAnglesOutput,
  postProcessAngles,
} from './agents/angles-post-processor.js';
export {
  type MatchVoicePackOptions,
  type SupabaseLike as VoicePackSupabaseLike,
  type VoicePackEntry,
  cosineSimilarity,
  matchVoicePack,
} from './agents/voice-pack-matcher.js';
// Agent 7 — Winners Selector / Editorial Director
export {
  AGENT_7_SYSTEM_PROMPT,
  AGENT_7_SYSTEM_PROMPT_STATS,
} from './agents/agent-7-system-prompt.js';
export {
  type AngleScoringEntry,
  type FusionProposed,
  type SelectAndWriteWinnersOptions,
  type SelectAndWriteWinnersResult,
  type UsageSummary as WinnersUsageSummary,
  type WinnersInput,
  selectAndWriteWinners,
} from './agents/winners-selector.js';
export {
  type PostProcessWinnersOutput,
  type WinnerOverride,
  type WinnersValidationReport,
  postProcessWinners,
} from './agents/winners-post-processor.js';
// Agent 8 — Visual Decision
export {
  type DecideVisualsOptions,
  type DecideVisualsResult,
  type UsageSummary as VisualsUsageSummary,
  type VisualsArray,
  SYSTEM_PROMPT_VISUAL,
  decideVisuals,
  visualsArraySchema,
} from './agents/visual-decision.js';
export {
  type PostProcessVisualsOutput,
  type VisualOverride,
  type VisualsValidationReport,
  postProcessVisuals,
} from './agents/visual-decision-post-processor.js';
// Agent 9 — Timing Recommendation (déterministe TypeScript)
export {
  type RecommendTimingOutput,
  parseHourBucket,
  recommendTiming,
} from './agents/timing-recommender.js';
// Notification — composeur d'email récap hebdo (utilisé par notify-weekly-report)
export {
  type ComposeEmailOptions,
  type ComposeEmailOutput,
  type WeeklyReportData,
  composeWeeklyReportEmail,
} from './agents/weekly-report-email.js';
// v2 mai 2026 — équité rotation produits Synvex (consommé par Agent 7)
export {
  type ProductCoverageDict,
  type SupabaseLike as ProductRotationSupabaseLike,
  emptyCoverage,
  getRecentlyCoveredProducts,
  prioritizeProducts,
  saturatedProducts,
} from './agents/product-rotation.js';

export const NEXUS_N8N_NODES_VERSION = '0.9.0';
