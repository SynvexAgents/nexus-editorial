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

export const NEXUS_N8N_NODES_VERSION = '0.5.0';
