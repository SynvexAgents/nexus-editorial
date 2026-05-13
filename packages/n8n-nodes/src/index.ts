// Helpers consommés par les Code Nodes n8n et par les scripts CLI.
// Au runtime n8n cloud, les imports `franc-min` peuvent être indisponibles ;
// le test-collector script utilise ce package directement, et l'inline JS du
// Code Node n8n (cf. n8n-workflows/) embarque une heuristique simplifiée.
// Source de vérité : `normalizer.ts` et ses tests Vitest.

export * from './date-utils.js';
export * from './apify-mappers.js';
export * from './normalizer.js';

export const NEXUS_N8N_NODES_VERSION = '0.2.0';
