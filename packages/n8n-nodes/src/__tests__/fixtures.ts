import type { RawPost } from '@nexus/shared';

// Tous les textes sont > 200 caractères pour passer le filtre too_short.
// Tous sont en français lucide ancré assurance, sans hooks bannis.

export const FR_TEXT_PILOTAGE =
  "Le ratio combiné des branches IARD a dérivé de quatre points sur l'exercice. L'IBNR n'a pas suivi le rythme des sinistres climatiques observés au premier semestre, et la prime d'équilibre doit être réajustée si l'on veut éviter de creuser le S/P l'année prochaine. Les comités techniques en parlent peu, c'est dommage : la dérive du loss ratio est un signal de pilotage que les comités exécutifs gagneraient à examiner plus régulièrement.";

export const FR_TEXT_COMMERCIAL =
  "La rétention des apporteurs courtage IARD est devenue un sujet sensible. Les bordereaux mensuels montrent une érosion progressive du churn vers les compagnies directes, et les rétrocessions sur commission linéaire n'ont pas suivi l'inflation des coûts d'acquisition. Les MGA qui ont sécurisé un apporteur exclusif tiennent mieux. Ceux qui ont laissé filer leurs apporteurs vers les comparateurs paient aujourd'hui le prix de la dilution commerciale, sans levier facile de reconquête.";

export const FR_TEXT_REGLEMENTAIRE =
  "La nouvelle doctrine ACPR sur la gouvernance IA en assurance fixe un cadre attendu depuis dix-huit mois. La défendabilité d'un agent IA en souscription dépend désormais d'un audit trail complet de chaque décision, avec validation humaine sur seuil documentée. Les acteurs qui ont anticipé cette obligation en construisant des chaînes de conformité dès le départ ont aujourd'hui un avantage opérationnel net sur ceux qui devront refondre leurs flux dans l'urgence.";

export const FR_TEXT_OPERATIONNEL =
  "Le traitement des sinistres MRP a allongé son délai moyen de huit jours en deux ans. La fraude documentaire monte également, particulièrement sur les sinistres dégât des eaux et bris de glace, et les indemnisations IJ en RC Pro deviennent plus contestées. Les services sinistres qui n'ont pas industrialisé la première étape de qualification dossier en souffrent le plus. Une matrice de délégation lisible, c'est ce qui fait la différence aujourd'hui dans nos retours terrain.";

export const FR_TEXT_TECH_IA =
  "Un agent IA vertical bien conçu en assurance n'a rien à voir avec une intégration LLM brute. Le bon design impose un seuil de confiance déclaratif, un journal des décisions tracé, et une logique métier séparée du modèle. Claude et GPT sont d'excellents moteurs sous-jacents, mais ce qui fait la différence d'un déploiement industriel, c'est l'orchestration par-dessus, souvent via n8n ou un workflow d'automation interne. Cette distinction, beaucoup d'éditeurs la sous-estiment encore.";

export const FR_TEXT_MARCHE =
  "Le marché du courtage français se recompose plus vite que prévu. Trois opérations de consolidation cette semaine dans le segment IARD régional, et l'arrivée de nouveaux acteurs insurtech sur le segment embedded change la donne sur la distribution affinitaire. Les mutuelles régionales qui n'ont pas anticipé cette accélération restent à la marge du mouvement. Le réassureur du milieu de tableau bouge également, et c'est un signal qu'il vaut la peine de regarder de près.";

export const FR_TEXT_AUTRE =
  "Quelques observations de la semaine. Nos clients reviennent souvent sur la même demande : un dialogue plus direct entre les équipes terrain et la direction. Pas une révélation, mais le fait que cela revienne avec autant de constance mérite d'être noté. Le management intermédiaire reste un point d'observation important pour qui veut comprendre la dynamique réelle des cabinets et des compagnies, indépendamment des plans stratégiques affichés en façade.";

export const EN_TEXT_LONG =
  'The brokers in property insurance still talk a lot about digitalization and transformation. The carriers have already moved to straight-through processing for over eighteen months now. The gap is widening in terms of operational productivity and the retention of partners brings tensions on commissions. The observation is clear: the French brokerage market must revisit its distribution model going forward, and the sooner the better given competitive pressure.';

export const FR_TEXT_SELF_PROMO =
  'Cette semaine, je partage un retour terrain rapide sur le traitement des sinistres dans le segment IARD professionnel. Les courtiers qui ont gagné en productivité ont systématiquement remis à plat leur matrice de délégation. Réservez votre démo cette semaine pour découvrir comment nous accompagnons les courtiers et MGA dans cette transformation. Inscrivez-vous à notre webinaire mensuel, le lien est dans ma bio. Offre spéciale pour les cinq premiers cabinets.';

export const FR_TEXT_TOO_SHORT =
  'Court billet du jour sur la productivité des courtiers IARD. Pas de constat profond, juste une intuition partagée avec mon réseau LinkedIn cet après-midi.';

interface BuildRawPostInput {
  post_id: string;
  profile_id: string;
  text: string;
  likes?: number;
  comments?: number;
  reposts?: number;
  published_at?: string;
  media_type?: RawPost['media_type'];
}

export function buildRawPost(input: BuildRawPostInput): RawPost {
  const publishedAt = input.published_at ?? '2026-05-12T09:30:00+02:00';
  return {
    post_id: input.post_id,
    profile_id: input.profile_id,
    published_at: publishedAt,
    day_of_week: 'Mar',
    hour_of_day: 9,
    text: input.text,
    media_type: input.media_type ?? 'texte',
    likes: input.likes ?? 100,
    comments: input.comments ?? 15,
    reposts: input.reposts ?? 3,
    views_estimees: null,
    url: `https://linkedin.com/posts/${input.post_id}`,
    comment_sample: null,
    collected_at: '2026-05-13T08:00:00+02:00',
    source_actor: 'harvestapi/linkedin-profile-posts',
  };
}
