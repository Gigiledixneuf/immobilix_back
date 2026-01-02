# Architecture du Système de Gestion des Demandes de Visite

## 📋 Vue d'ensemble

Ce document décrit l'architecture complète du système de gestion des demandes de visite immobilière, incluant :
- Identification du demandeur avec profil complet
- Gestion des disponibilités du bailleur
- Système de créneaux horaires intelligents
- Blocage automatique des horaires confirmés
- Gestion des conflits et cas limites

## 🗄️ Modèle de données

### Tables principales

#### 1. `visit_requests` - Demandes de visite
```sql
- id (PK)
- property_id (FK → properties)
- tenant_id (FK → users) - Le demandeur
- requested_date (DATE)
- requested_time (TIME)
- message (TEXT, nullable)
- status (ENUM: pending, accepted, rejected, completed, cancelled)
- scheduled_at (DATETIME, nullable) - Date/heure confirmée
- time_slot_id (FK → visit_time_slots, nullable) - Créneau réservé
- created_at, updated_at
```

**Relations :**
- `belongsTo` Property
- `belongsTo` User (tenant)
- `belongsTo` VisitTimeSlot (optionnel)

#### 2. `landlord_availabilities` - Disponibilités du bailleur
```sql
- id (PK)
- landlord_id (FK → users)
- available_days (JSON) - ["monday", "tuesday", ...]
- start_time (VARCHAR(5)) - Format HH:mm (ex: "08:00")
- end_time (VARCHAR(5)) - Format HH:mm (ex: "17:00")
- visit_duration_minutes (INT) - Durée standard d'une visite (défaut: 30)
- is_active (BOOLEAN) - Une seule configuration active par bailleur
- created_at, updated_at
```

**Relations :**
- `belongsTo` User (landlord)

#### 3. `visit_time_slots` - Créneaux horaires générés
```sql
- id (PK)
- property_id (FK → properties)
- slot_date (DATE)
- start_time (VARCHAR(5)) - Format HH:mm
- end_time (VARCHAR(5)) - Format HH:mm
- status (ENUM: available, reserved, blocked)
- visit_request_id (FK → visit_requests, nullable)
- created_at, updated_at

UNIQUE (property_id, slot_date, start_time)
```

**Relations :**
- `belongsTo` Property
- `belongsTo` VisitRequest (optionnel)

#### 4. `users` - Utilisateurs (enrichi)
```sql
- id (PK)
- fullName (VARCHAR)
- email (VARCHAR, unique)
- portable (VARCHAR)
- profile_photo_url (VARCHAR, nullable) - ✨ Nouveau champ
- password
- created_at, updated_at
```

## 🔄 Workflow de demande de visite

### 1. Configuration initiale (Bailleur)

```typescript
// Le bailleur configure ses disponibilités
POST /api/landlord/availabilities
{
  "available_days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
  "start_time": "08:00",
  "end_time": "17:00",
  "visit_duration_minutes": 30
}

// → Génère automatiquement les créneaux pour les 30 prochains jours
```

### 2. Consultation des créneaux disponibles (Locataire)

```typescript
// Le locataire consulte les créneaux disponibles
GET /api/properties/:id/available-slots?start_date=2024-01-15&end_date=2024-01-22

// Réponse : Liste des créneaux avec statut "available"
[
  {
    "id": 1,
    "slot_date": "2024-01-15",
    "start_time": "09:00",
    "end_time": "09:30",
    "status": "available"
  },
  // ...
]
```

### 3. Création d'une demande (Locataire)

```typescript
POST /api/properties/:id/visit-requests
{
  "requested_date": "2024-01-15",
  "requested_time": "09:00",
  "message": "Je souhaite visiter cet appartement"
}

// → Vérifie que le créneau existe et est disponible
// → Crée la demande avec time_slot_id associé
// → Le créneau reste "available" jusqu'à acceptation
```

### 4. Acceptation/Refus (Bailleur)

```typescript
PATCH /api/visit-requests/:id/status
{
  "status": "accepted",
  "scheduled_at": "2024-01-15T09:00:00Z" // Optionnel
}

// → Si acceptée :
//   - Le créneau associé passe en statut "reserved"
//   - scheduled_at est défini
//   - Notification envoyée au locataire

// → Si refusée :
//   - Le créneau est libéré (redevient "available")
//   - Notification envoyée au locataire
```

### 5. Annulation (Locataire ou automatique)

```typescript
DELETE /api/visit-requests/:id

// → Si un créneau était associé, il est libéré
// → La demande est supprimée (si pending) ou marquée cancelled
```

## 🎯 Logique métier clé

### Génération automatique des créneaux

**Service : `VisitSlotService.generateTimeSlots()`**

1. Récupère la disponibilité active du bailleur
2. Pour chaque jour de la période :
   - Vérifie si le jour est dans `available_days`
   - Génère les créneaux de `start_time` à `end_time` par tranches de `visit_duration_minutes`
   - Évite les créneaux déjà existants (sauf si `regenerate=true`)
3. Insère les nouveaux créneaux avec statut `available`

**Exemple :**
- Disponibilité : Lundi-Vendredi, 08:00-17:00, durée 30min
- Créneaux générés : 08:00-08:30, 08:30-09:00, 09:00-09:30, ..., 16:30-17:00

### Gestion des conflits

**Réservation atomique : `VisitSlotService.reserveSlot()`**

1. Utilise une transaction pour éviter les conditions de course
2. Vérifie que le créneau est `available`
3. Met à jour le statut à `reserved` et lie `visit_request_id`
4. Si le créneau est déjà réservé, lève une erreur

**Protection contre les doubles réservations :**
- Contrainte unique : `(property_id, slot_date, start_time)`
- Transaction atomique lors de la réservation
- Vérification de disponibilité avant création de demande

### Affichage du profil demandeur

**Dans les réponses API :**

```typescript
// GET /api/properties/:id/visit-requests
{
  "data": [
    {
      "id": 1,
      "tenant": {
        "id": 5,
        "fullName": "Jean Dupont",
        "email": "jean@example.com",
        "portable": "+243900000000",
        "profilePhotoUrl": "/uploads/users/photo.jpg" // ✨ Photo du profil
      },
      "requested_date": "2024-01-15",
      "requested_time": "09:00:00",
      "status": "pending"
    }
  ]
}
```

## 📡 Endpoints API

### Demandes de visite

| Méthode | Endpoint | Description | Rôle |
|---------|----------|-------------|------|
| POST | `/api/properties/:id/visit-requests` | Créer une demande | Locataire |
| GET | `/api/properties/:id/visit-requests` | Lister les demandes d'une propriété | Bailleur |
| GET | `/api/visit-requests/me` | Mes demandes | Les deux |
| PATCH | `/api/visit-requests/:id/status` | Accepter/Refuser | Bailleur |
| DELETE | `/api/visit-requests/:id` | Annuler | Locataire |

### Créneaux horaires

| Méthode | Endpoint | Description | Rôle |
|---------|----------|-------------|------|
| GET | `/api/properties/:id/available-slots` | Créneaux disponibles | Public |
| POST | `/api/properties/:id/block-slot` | Bloquer un créneau | Bailleur |
| DELETE | `/api/time-slots/:id/block` | Débloquer un créneau | Bailleur |

### Disponibilités

| Méthode | Endpoint | Description | Rôle |
|---------|----------|-------------|------|
| GET | `/api/landlord/availabilities` | Ma disponibilité | Bailleur |
| POST | `/api/landlord/availabilities` | Configurer disponibilité | Bailleur |

## 🔍 Cas limites et gestion d'erreurs

### 1. Créneau déjà réservé

**Scénario :** Deux locataires demandent le même créneau simultanément

**Solution :**
- Transaction atomique lors de la réservation
- Premier arrivé, premier servi
- Le second reçoit une erreur : "Ce créneau a déjà été réservé"

```typescript
// Dans updateStatus() si acceptation
try {
  await slotService.reserveSlot(...)
} catch (error) {
  return response.badRequest({
    message: 'Ce créneau a déjà été réservé par une autre demande'
  })
}
```

### 2. Annulation d'une demande acceptée

**Scénario :** Un locataire annule une demande déjà acceptée

**Règles métier :**
- Une demande `accepted` ne peut pas être annulée directement par DELETE
- Doit passer par un nouveau workflow (reprogrammation ou annulation mutuelle)
- Le créneau reste réservé jusqu'à action du bailleur

**Implémentation actuelle :**
- Seules les demandes `pending` peuvent être annulées
- Les demandes `accepted` nécessitent une action du bailleur

### 3. Modification des disponibilités

**Scénario :** Le bailleur change ses disponibilités après génération de créneaux

**Solution :**
- Les créneaux existants restent inchangés
- Seuls les nouveaux créneaux sont générés selon les nouvelles règles
- Les créneaux déjà réservés ne sont pas affectés
- Option `regenerate=true` pour forcer la régénération (à utiliser avec précaution)

### 4. Créneaux sans disponibilité configurée

**Scénario :** Un bailleur n'a pas configuré ses disponibilités

**Solution :**
- `generateTimeSlots()` retourne 0 créneaux générés
- Les demandes peuvent toujours être créées (compatibilité avec l'ancien système)
- `timeSlotId` reste `null`

### 5. Demande avec créneau hors disponibilités

**Scénario :** Un locataire demande un créneau qui n'est pas dans les disponibilités

**Solution :**
- `findOrCreateSlot()` lève une erreur
- La demande est créée mais sans `timeSlotId`
- Le bailleur peut toujours accepter manuellement

### 6. Créneau expiré

**Scénario :** Un créneau est dans le passé

**Solution :**
- Les créneaux passés ne sont pas retournés par `getAvailableSlots()`
- La validation empêche la création de demandes avec date passée
- Un job périodique pourrait nettoyer les anciens créneaux (à implémenter)

## 🚀 Optimisations et évolutions futures

### 1. Génération asynchrone des créneaux

Actuellement, la génération se fait de manière synchrone. Pour de grandes périodes :

```typescript
// Job périodique (ex: tous les jours à minuit)
// Génère les créneaux pour les 30 prochains jours
```

### 2. Cache des créneaux disponibles

Pour améliorer les performances sur les propriétés populaires :

```typescript
// Cache Redis avec TTL de 5 minutes
// Clé: `property:${propertyId}:slots:${date}`
```

### 3. Reprogrammation de visite

**Workflow :**
1. Le bailleur propose une nouvelle date/heure
2. Le locataire accepte ou refuse
3. L'ancien créneau est libéré, le nouveau est réservé

### 4. Historique des visites

Ajout d'un champ `visited_at` et d'un statut `completed` :
- Permet de suivre les visites effectuées
- Statistiques pour le bailleur (taux de conversion, etc.)

### 5. Notifications en temps réel

Utilisation de WebSocket pour :
- Notification instantanée lors de réservation d'un créneau
- Mise à jour en temps réel de la liste des créneaux disponibles

## 📊 Exemples de requêtes

### Configuration d'une disponibilité (Bailleur)

```bash
POST /api/landlord/availabilities
Authorization: Bearer <token>
Content-Type: application/json

{
  "available_days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
  "start_time": "09:00",
  "end_time": "17:00",
  "visit_duration_minutes": 45
}
```

### Consultation des créneaux (Locataire)

```bash
GET /api/properties/123/available-slots?start_date=2024-01-15&end_date=2024-01-22
```

### Création d'une demande (Locataire)

```bash
POST /api/properties/123/visit-requests
Authorization: Bearer <token>
Content-Type: application/json

{
  "requested_date": "2024-01-16",
  "requested_time": "10:00",
  "message": "Bonjour, je souhaite visiter cet appartement. Disponible toute la matinée."
}
```

### Acceptation d'une demande (Bailleur)

```bash
PATCH /api/visit-requests/456/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "accepted",
  "scheduled_at": "2024-01-16T10:00:00Z"
}
```

## 🧪 Tests recommandés

### Tests unitaires

1. `VisitSlotService.generateTimeSlots()` - Génération correcte des créneaux
2. `VisitSlotService.reserveSlot()` - Gestion des conflits
3. `LandlordAvailabilityService.createOrUpdateAvailability()` - Désactivation des anciennes disponibilités

### Tests d'intégration

1. Création d'une demande → Vérification du créneau associé
2. Acceptation → Vérification du statut "reserved" du créneau
3. Annulation → Vérification de la libération du créneau
4. Double réservation → Vérification de l'erreur

### Tests de charge

1. Génération de créneaux pour 100 propriétés sur 30 jours
2. Réservation simultanée du même créneau (test de concurrence)

## 📝 Notes importantes

1. **Compatibilité ascendante** : Le système fonctionne même sans disponibilités configurées
2. **Transactions** : Utilisées pour garantir la cohérence lors des réservations
3. **Index** : Optimisés pour les requêtes fréquentes (property_id + date, status)
4. **Contraintes** : Unique constraint sur (property_id, slot_date, start_time) pour éviter les doublons

## 🔗 Fichiers clés

- **Modèles :**
  - `app/models/visit_request.ts`
  - `app/models/visit_time_slot.ts`
  - `app/models/landlord_availability.ts`
  - `app/models/user.ts` (enrichi avec `profilePhotoUrl`)

- **Services :**
  - `app/services/visit_slot_service.ts` - Logique de génération et réservation
  - `app/services/landlord_availability_service.ts` - Gestion des disponibilités

- **Contrôleurs :**
  - `app/controllers/VisitRequestsController.ts`
  - `app/controllers/VisitTimeSlotsController.ts`
  - `app/controllers/LandlordAvailabilitiesController.ts`

- **Validators :**
  - `app/validators/visit_request.ts`
  - `app/validators/landlord_availability.ts`

- **Migrations :**
  - `database/migrations/1769000000000_create_landlord_availabilities_table.ts`
  - `database/migrations/1769000000001_create_visit_time_slots_table.ts`
  - `database/migrations/1769000000002_alter_visit_requests_table_add_time_slot_id.ts`
  - `database/migrations/1769000000003_add_profile_photo_to_users_table.ts`


