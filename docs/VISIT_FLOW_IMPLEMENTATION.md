# Implémentation du Workflow de Gestion des Visites

## ✅ Fonctionnalités Implémentées

### 1. Double Confirmation de Visite

**Endpoint :** `PATCH /api/visit-requests/:id/complete`

**Règles métier :**
- ✅ Visite doit être `accepted`
- ✅ `scheduled_at` doit être passé
- ✅ Délai de confirmation (48h par défaut) non dépassé
- ✅ Les deux parties doivent confirmer pour passer en `completed`
- ✅ Mise à jour automatique des scores de fiabilité (+10 pour visite complétée)

**Utilisation :**
```bash
PATCH /api/visit-requests/1/complete
Authorization: Bearer <token>
{
  "confirmed_by": "landlord",
  "notes": "Visite effectuée avec succès"
}
```

### 2. Pré-Confirmation (Anti-Fantôme)

**Endpoint :** `POST /api/visit-requests/:id/pre-confirm`

**Règles métier :**
- ✅ Possible entre 12h et 24h avant `scheduled_at`
- ✅ Seul le locataire peut pré-confirmer
- ✅ Empêche l'auto-cancellation

**Utilisation :**
```bash
POST /api/visit-requests/1/pre-confirm
Authorization: Bearer <token>
```

### 3. Gestion du NO-SHOW

**Détection automatique :**
- Si bailleur confirme mais locataire ne confirme pas dans le délai
- → Statut `no_show`
- Score de fiabilité : -20

**Traitement :**
- Exécuté automatiquement par la commande `node ace visit:process-automatic-actions`
- Peut être programmé via cron : `0 */6 * * *` (toutes les 6h)

### 4. Auto-Cancellation

**Détection automatique :**
- Si pas de pré-confirmation 12h avant `scheduled_at`
- → Statut `auto_cancelled`
- Créneau libéré automatiquement
- Score de fiabilité : -5

### 5. Création de Candidature depuis Visite

**Endpoint :** `POST /api/visit-requests/:id/create-application`

**Règles métier :**
- ✅ Visite doit être `completed`
- ✅ Une seule candidature active par visite
- ✅ Créée par le bailleur

**Utilisation :**
```bash
POST /api/visit-requests/1/create-application
Authorization: Bearer <token>
{
  "message": "Candidature suite à la visite"
}
```

### 6. Statistiques

**Endpoints :**
- `GET /api/landlord/visit-statistics` : Statistiques globales
- `GET /api/properties/:id/visit-statistics` : Statistiques par propriété

**Données retournées :**
- Demandes par statut
- Taux de conversion (visite → candidature → contrat)
- Nombre de no-show et auto-cancellations
- Temps moyens entre étapes

## 🔧 Services Créés

### VisitFlowService

Service métier centralisé avec les méthodes :
- `confirmVisit()` : Confirmer une visite
- `preConfirmVisit()` : Pré-confirmer une visite
- `detectNoShow()` : Détecter un no-show
- `autoCancelIfNoPreConfirmation()` : Auto-annuler si pas de pré-confirmation
- `createApplicationFromVisit()` : Créer une candidature
- `processAutomaticActions()` : Traiter toutes les actions automatiques

### VisitStatisticsService

Service de statistiques avec les méthodes :
- `getLandlordStatistics()` : Statistiques globales
- `getPropertyStatistics()` : Statistiques par propriété

## 🗄️ Migrations Existantes

Les migrations suivantes existent déjà :
- ✅ `1767575460812_create_enrich_visit_requests_with_completion_fields_table.ts`
- ✅ `1767575535851_create_add_visit_request_id_to_applications_and_contracts_table.ts`
- ✅ `1767575568252_create_add_reliability_score_to_users_table.ts`

## 📊 Modèles Mis à Jour

### VisitRequest

Champs ajoutés :
- `completedAt`, `completedByLandlord`, `completedByTenant`
- `tenantPreConfirmed`, `preConfirmedAt`
- `visitNotesLandlord`, `visitNotesTenant`
- `confirmationDeadlineHours` (défaut: 48h)

Statuts :
- `pending`, `accepted`, `rejected`, `completed`, `cancelled`
- `auto_cancelled`, `no_show`

### Application

- `visitRequestId` : Lien avec la visite

### Contract

- `visitRequestId` : Lien avec la visite

### User

- `reliabilityScore` : Score de fiabilité (défaut: 0)

## ⚙️ Commandes Disponibles

### Traitement Automatique

```bash
node ace visit:process-automatic-actions
```

Cette commande :
1. Détecte les no-show
2. Auto-annule les visites sans pré-confirmation
3. Met à jour les scores de fiabilité

**Cron recommandé :**
```bash
# Toutes les 6 heures
0 */6 * * * cd /path/to/app && node ace visit:process-automatic-actions
```

## 📝 Workflow Complet

```
1. Bailleur configure disponibilités
   ↓
2. Créneaux générés automatiquement
   ↓
3. Locataire demande visite
   ↓
4. Bailleur accepte/refuse
   ↓
5. Si acceptée :
   - Locataire pré-confirme (12-24h avant) [Optionnel mais recommandé]
   - Si pas de pré-confirmation 12h avant → auto_cancelled
   ↓
6. Après scheduled_at :
   - Bailleur confirme visite
   - Locataire confirme visite
   - Si les deux confirment → completed (+10 score)
   - Si seul bailleur confirme et délai dépassé → no_show (-20 score)
   ↓
7. Si completed :
   - Bailleur peut créer candidature
   ↓
8. Candidature acceptée :
   - Bailleur peut créer contrat
```

## 🧪 Tests Recommandés

### Tests Unitaires

1. **VisitFlowService.confirmVisit()**
   - Confirmation trop tôt (avant scheduled_at)
   - Confirmation hors délai (après deadline)
   - Double confirmation
   - Passage automatique en `completed`

2. **VisitFlowService.preConfirmVisit()**
   - Pré-confirmation hors délai
   - Pré-confirmation par non-locataire

3. **VisitFlowService.detectNoShow()**
   - Détection correcte du no-show
   - Pas de no-show si les deux confirment

4. **VisitFlowService.autoCancelIfNoPreConfirmation()**
   - Auto-cancellation correcte
   - Pas d'auto-cancellation si pré-confirmé

### Tests d'Intégration

1. Workflow complet : demande → acceptation → pré-confirmation → complétion
2. Création de candidature depuis visite complétée
3. Statistiques correctes

## 🚨 Cas d'Erreur Gérés

- ✅ Visite non acceptée → Erreur explicite
- ✅ Confirmation avant scheduled_at → Erreur explicite
- ✅ Délai dépassé → Erreur explicite
- ✅ Double confirmation → Erreur explicite
- ✅ Pré-confirmation hors délai → Erreur explicite
- ✅ Candidature déjà existante → Erreur explicite

## 📋 Checklist de Déploiement

- [ ] Exécuter les migrations
- [ ] Configurer le cron job pour `visit:process-automatic-actions`
- [ ] Tester les endpoints manuellement
- [ ] Vérifier les notifications
- [ ] Vérifier les scores de fiabilité
- [ ] Tester le workflow complet end-to-end
