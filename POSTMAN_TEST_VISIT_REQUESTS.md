# Guide de test API - Demandes de visite (Visit Requests)

## 📋 Prérequis

1. **Base URL** : `http://localhost:3333` (ou votre URL de serveur)
2. **Authentification** : Bearer Token (obtenu via `/api/login`)

---

## 🔐 Étape 1 : Obtenir un token d'authentification

### POST /api/login

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "email": "locataire1@example.com",
  "password": "password123"
}
```

**Réponse attendue:**
```json
{
  "status": "success",
  "message": "Logged in successfully",
  "data": {
    "user": { ... },
    "accessToken": "votre_token_ici",
    "refreshToken": "..."
  }
}
```

⚠️ **Copiez le `accessToken` pour les requêtes suivantes !**

---

## 📝 Étape 2 : Créer une demande de visite

### POST /api/properties/:id/visit-requests

**Méthode:** `POST`

**URL:** `http://localhost:3333/api/properties/1/visit-requests`

*(Remplacez `1` par l'ID d'une propriété existante)*

**Headers:**
```
Authorization: Bearer VOTRE_TOKEN_ICI
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "requested_date": "2024-12-25",
  "requested_time": "14:30",
  "message": "Je souhaite visiter cette propriété pour voir si elle correspond à mes besoins."
}
```

**Réponse attendue (201):**
```json
{
  "status": "success",
  "message": "Demande de visite créée avec succès",
  "data": {
    "id": 1,
    "propertyId": 1,
    "tenantId": 2,
    "requestedDate": "2024-12-25",
    "requestedTime": "14:30:00",
    "message": "Je souhaite visiter cette propriété...",
    "status": "pending",
    "scheduledAt": null,
    "createdAt": "2024-12-20T10:00:00.000Z",
    "updatedAt": "2024-12-20T10:00:00.000Z"
  }
}
```

**⚠️ Note:** 
- `requested_date` : Format `YYYY-MM-DD` (doit être dans le futur)
- `requested_time` : Format `HH:mm` (sera converti en `HH:mm:ss`)
- `message` : Optionnel

---

## 📋 Étape 3 : Lister mes demandes de visite (Locataire)

### GET /api/visit-requests/me

**Méthode:** `GET`

**URL:** `http://localhost:3333/api/visit-requests/me`

**Headers:**
```
Authorization: Bearer VOTRE_TOKEN_ICI
```

**Réponse attendue (200):**
```json
{
  "status": "success",
  "message": "Mes demandes de visite",
  "data": [
    {
      "id": 1,
      "propertyId": 1,
      "tenantId": 2,
      "requestedDate": "2024-12-25",
      "requestedTime": "14:30:00",
      "message": "...",
      "status": "pending",
      "scheduledAt": null,
      "property": {
        "id": 1,
        "name": "Appartement centre-ville",
        ...
      },
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

---

## 🏠 Étape 4 : Lister les demandes pour une propriété (Bailleur)

### GET /api/properties/:id/visit-requests

**Méthode:** `GET`

**URL:** `http://localhost:3333/api/properties/1/visit-requests`

*(Remplacez `1` par l'ID de votre propriété)*

**Headers:**
```
Authorization: Bearer TOKEN_BAILLEUR_ICI
```

⚠️ **Important:** Vous devez être connecté en tant que **propriétaire** de la propriété !

**Réponse attendue (200):**
```json
{
  "status": "success",
  "message": "Demandes de visite",
  "data": [
    {
      "id": 1,
      "propertyId": 1,
      "tenantId": 2,
      "requestedDate": "2024-12-25",
      "requestedTime": "14:30:00",
      "message": "...",
      "status": "pending",
      "scheduledAt": null,
      "tenant": {
        "id": 2,
        "fullName": "Jean Dupont",
        "email": "locataire1@example.com",
        "portable": "+243900000000"
      },
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

---

## ✅ Étape 5 : Accepter une demande de visite (Bailleur)

### PATCH /api/visit-requests/:id/status

**Méthode:** `PATCH`

**URL:** `http://localhost:3333/api/visit-requests/1/status`

*(Remplacez `1` par l'ID de la demande de visite)*

**Headers:**
```
Authorization: Bearer TOKEN_BAILLEUR_ICI
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "status": "accepted",
  "scheduled_at": "2024-12-25T14:30:00.000Z"
}
```

**Réponse attendue (200):**
```json
{
  "status": "success",
  "message": "Demande de visite acceptée",
  "data": {
    "id": 1,
    "propertyId": 1,
    "tenantId": 2,
    "requestedDate": "2024-12-25",
    "requestedTime": "14:30:00",
    "status": "accepted",
    "scheduledAt": "2024-12-25T14:30:00.000Z",
    ...
  }
}
```

**Note:** `scheduled_at` est optionnel. Si non fourni, la date/heure demandée sera utilisée.

---

## ❌ Étape 6 : Refuser une demande de visite (Bailleur)

### PATCH /api/visit-requests/:id/status

**Méthode:** `PATCH`

**URL:** `http://localhost:3333/api/visit-requests/1/status`

**Headers:**
```
Authorization: Bearer TOKEN_BAILLEUR_ICI
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "status": "rejected"
}
```

**Réponse attendue (200):**
```json
{
  "status": "success",
  "message": "Demande de visite refusée",
  "data": {
    "id": 1,
    "status": "rejected",
    ...
  }
}
```

---

## 🗑️ Étape 7 : Annuler une demande de visite (Locataire)

### DELETE /api/visit-requests/:id

**Méthode:** `DELETE`

**URL:** `http://localhost:3333/api/visit-requests/1`

*(Remplacez `1` par l'ID de votre demande de visite)*

**Headers:**
```
Authorization: Bearer TOKEN_LOCATAIRE_ICI
```

⚠️ **Important:** 
- Vous devez être le locataire qui a créé la demande
- La demande doit être en statut `pending` pour être annulée

**Réponse attendue (200):**
```json
{
  "status": "success",
  "message": "Demande de visite annulée"
}
```

---

## 🧪 Scénarios de test supplémentaires

### Test 1 : Date dans le passé (doit échouer)

**POST /api/properties/1/visit-requests**
```json
{
  "requested_date": "2023-01-01",
  "requested_time": "14:30"
}
```

**Réponse attendue (400):**
```json
{
  "message": "La date demandée ne peut pas être dans le passé"
}
```

---

### Test 2 : Format de date invalide (doit échouer)

**POST /api/properties/1/visit-requests**
```json
{
  "requested_date": "25/12/2024",
  "requested_time": "14:30"
}
```

**Réponse attendue (422):** Erreur de validation

---

### Test 3 : Format d'heure invalide (doit échouer)

**POST /api/properties/1/visit-requests**
```json
{
  "requested_date": "2024-12-25",
  "requested_time": "25:99"
}
```

**Réponse attendue (422):** Erreur de validation

---

### Test 4 : Doublon (demande identique déjà en attente)

**POST /api/properties/1/visit-requests** (deux fois avec les mêmes paramètres)

**Première requête:** ✅ 201 Created

**Deuxième requête:** ❌ 400 Bad Request
```json
{
  "message": "Une demande de visite est déjà en attente pour cette date et heure"
}
```

---

### Test 5 : Accès non autorisé (bailleur essaie d'accéder aux demandes d'une autre propriété)

**GET /api/properties/999/visit-requests** (propriété qui ne vous appartient pas)

**Réponse attendue (403):**
```json
{
  "message": "Vous n'êtes pas propriétaire de ce logement"
}
```

---

### Test 6 : Annuler une demande déjà acceptée (doit échouer)

**DELETE /api/visit-requests/1** (pour une demande avec status "accepted")

**Réponse attendue (400):**
```json
{
  "message": "Cette demande ne peut plus être annulée"
}
```

---

## 📊 États possibles d'une demande de visite

- `pending` : En attente de réponse du bailleur
- `accepted` : Acceptée par le bailleur
- `rejected` : Refusée par le bailleur
- `completed` : Visite terminée (futur)
- `cancelled` : Annulée par le locataire

---

## 💡 Conseils pour tester dans Postman

1. **Créer une Collection Postman** avec tous ces endpoints
2. **Créer une Variable d'environnement** `base_url` = `http://localhost:3333`
3. **Créer une Variable d'environnement** `token` pour stocker le token après login
4. **Utiliser un script Pre-request** pour automatiquement injecter le token :
   ```javascript
   pm.request.headers.add({
     key: 'Authorization',
     value: 'Bearer ' + pm.environment.get('token')
   })
   ```

5. **Sauvegarder le token automatiquement** après le login avec un script Test :
   ```javascript
   if (pm.response.code === 200) {
       var jsonData = pm.response.json();
       pm.environment.set("token", jsonData.data.accessToken);
   }
   ```

---

## ✅ Checklist de test

- [ ] Login locataire → obtenir token
- [ ] Créer une demande de visite
- [ ] Lister mes demandes de visite
- [ ] Login bailleur → obtenir token
- [ ] Lister les demandes pour une propriété (en tant que bailleur)
- [ ] Accepter une demande de visite
- [ ] Refuser une demande de visite
- [ ] Login locataire à nouveau
- [ ] Vérifier que le statut a été mis à jour
- [ ] Annuler une demande en attente
- [ ] Tester les validations (date passée, format invalide, etc.)
- [ ] Tester les erreurs d'autorisation
