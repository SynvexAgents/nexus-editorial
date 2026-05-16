# Synvex — Context Brief opérationnel Nexus Editorial

> Notes contextuelles à destination des agents IA en aval (Agents 6 Angles et 7 Winners en particulier). Document append-only : nouvelles sections ajoutées au fil de l'apprentissage opérationnel.

---

## 8. Insight stratégique LinkedIn FR

Audit réalisé en S1 sur la watchlist Nexus Editorial : **l'écosystème assurance français est largement absent de LinkedIn en tant que producteur de contenu**.

Sur 23 profils assurance FR auditités (Top-5 courtage, MGA, consultants, presse spécialisée, insurtechs B2B) :

- 17 sont muets (0 post sur 30j).
- 5 publient 1-3 posts/mois.
- 1 seul publie densément (Florian Graillot, astoryaVC) — mais 100 % en anglais.

### Implications éditoriales pour les Agents 6 et 7

**1. Synvex n'écrit pas dans un espace saturé.**
La concurrence éditoriale pour l'attention des décideurs assurance FR sur LinkedIn est marginale. Pas de bataille de voix à mener.

**2. Les angles ne se positionnent pas "vs les autres voix du secteur".**
Il n'y en a pas, ou si peu. Les Agents Angles (6) et Winners (7) doivent **éclairer le secteur depuis l'extérieur** — lucidité, signal, observation — pas s'inscrire dans un débat existant. Le ton naturel est l'apport d'information ou de cadrage, pas la réfutation.

**3. L'audience cible consomme son contenu professionnel ailleurs.**
Les dirigeants courtage, MGA, mutuelles s'informent via :
- L'Argus de l'assurance (papier et site).
- News Assurances Pro.
- Newsletters internes.
- Événements (Rencontres de l'AMRAE, Journée de l'ACPR, Forum Insurtech, etc.).

LinkedIn est pour eux **un canal de découverte et d'opportunité commerciale**, pas leur source primaire d'information. Les posts Synvex doivent donc **intriguer et qualifier** — pas éduquer en profondeur.

**4. Format implicite des posts produits.**
- Le constat lucide (chiffre + lecture courte) performe mieux que la pédagogie pure.
- L'anecdote terrain (1 phrase + analyse 3 lignes) performe mieux que le retour d'expérience long.
- Le contrarian assurance qui prend le contrepied d'un point établi a une force démesurée parce que peu de voix le font.
- Éviter les "ce qu'on m'a souvent demandé", "voici 5 leçons", "X années plus tard" — tout ce registre creator personnel doit être absent.

**5. Voix dense identifiée (à monitorer mais hors collecte directe).**
Florian Graillot (astoryaVC) est la voix insurtech FR la plus dense. Il publie en anglais donc filtré par notre pipeline FR-only, mais ses signaux sont à surveiller en input "manuel" pour l'Agent 5 (InsuranceTrends Perplexity) qui pourrait croiser ses takes.

### Source de cet insight

Audit Apify 30j (acteur `harvestapi/linkedin-profile-posts`) du 2026-05-14 sur 23 profils assurance FR sourcés via web_search et `argusdelassurance.com` + audit langue franc-min. Coût total audit : ~€0,30. Documenté dans `watchlist_v0.2.md` et `watchlist_v0.3.md` du repo.

---

## 9. Périmètre produit Synvex et lignes assurance couvertes

Cette section est UNE LIMITE DURE pour les angles éditoriaux. Les 
Agents 6 (Angles Generator) et 7 (Editorial Director) doivent 
strictement respecter ce périmètre. Tout angle qui sort de ces 
lignes doit être écarté ou repositionné.

### Lignes COUVERTES (sujets éditoriaux acceptables)

- **Prévoyance et IJ** : collectif entreprise, individuel 
  professionnel (TNS), arrêt de travail, invalidité, décès. Produit 
  Synvex associé : Helios.
- **Santé complémentaire collective** : contrats entreprise, 
  branches professionnelles, accords de branche, conventions 
  collectives. Produit Synvex associé : Chiron, Atlas.
- **Santé complémentaire individuelle** : uniquement si l'angle 
  est cabinet/mutuelle ou pilotage (pas angle "consommateur final"). 
  Produit Synvex associé : Chiron.
- **Santé animale** : assurance pet B2B. Produit Synvex associé : 
  Chiron.
- **IARD professionnelle** : MRP (Multirisque Professionnelle), 
  RC Pro (Responsabilité Civile Professionnelle), Décennale, PJ Pro 
  (Protection Juridique professionnelle), Cyber, Flotte 
  professionnelle. Produit Synvex associé : Argus.
- **Pilotage cabinet courtage** : bordereaux, commissions, 
  rétrocessions, rétention portefeuille, churn, apporteurs, comptes 
  techniques cabinet. Produit Synvex associé : Hermès, Atlas.
- **Infrastructure multi-agents et orchestration** : courtiers-
  grossistes, MGA, opérateurs embedded multi-marques/pays/carriers. 
  Produit Synvex associé : Cortex.

### Lignes HORS PÉRIMÈTRE (interdites comme sujet principal d'un post)

- **MRH particulier** (Multirisque Habitation des particuliers, 
  CatNat habitation, sécheresse, dégâts des eaux, vol résidence)
- **Auto particulier** (responsabilité civile auto, tous risques, 
  bris de glace, vol)
- **Auto deux-roues particulier**
- **Voyage et annulation grand public**
- **Vie épargne particulier** (assurance vie, PER individuel, 
  capitalisation)
- **Obsèques particulier**
- **Animaux de compagnie B2C direct** (Chiron est B2B uniquement)
- **Crédit / emprunteur particulier**
- **Garantie loyers impayés grand public**

### Cas limites acceptables

Un sujet hors-périmètre PEUT servir d'angle SI ET SEULEMENT SI le 
post le re-cadre explicitement côté cabinet courtage, MGA, ou 
mutuelle/délégataire — et que cette re-formulation est claire dès 
le hook (les 3 premières phrases).

**Exemple acceptable** : "Les cabinets de courtage qui gèrent du 
MRH particulier voient leur charge opérationnelle augmenter avec 
la hausse des sinistres CatNat. Plus de bordereaux à expliquer, 
plus de pédagogie par gestionnaire."
→ Le hook parle de cabinet, pas de l'assuré particulier.

**Exemple INACCEPTABLE** : "La franchise sécheresse en habitation 
est passée à 1 520 €. Pour les assurés, la facture monte."
→ Le hook parle directement de l'assuré particulier. À rejeter.

### Règle pour les agents

- Agent 6 (Angles Generator) : si un angle proposé concerne une 
  ligne hors-périmètre ET ne peut PAS être re-cadré côté cabinet/
  MGA/mutuelle dès le hook, REMPLACE-LE par un autre angle dans 
  le même archétype, en t'appuyant prioritairement sur les autres 
  inputs (insurance_trends sur lignes couvertes, linkedin_trends 
  sur ICP cabinet/MGA).
- Agent 7 (Editorial Director) : applique un MALUS de -3 points au 
  score `autorite_synvex` sur tout angle dont le hook est centré 
  côté particulier. Si après malus l'angle reste dans le top 3, 
  vérifie si le re-cadrage cabinet est faisable. Sinon écarte.

### Note pour le futur

Cette liste reflète le catalogue Synvex de mai 2026. Si Synvex 
lance un produit grand public (ex : un produit MRH particulier), 
mettre à jour cette section avant le prochain run hebdomadaire.
