# Système de Paiement CASH pour Propriétés

## 📋 Vue d'ensemble

Système complet de paiement en espèces (CASH) pour les propriétés immobilières, permettant aux locataires de payer :
- **La CAUTION** (security deposit) - une seule fois par propriété
- **Le LOYER MENSUEL** (rent) - chaque mois

Avec double confirmation : locataire initie → bailleur confirme → facture générée automatiquement.

---

## 🗄️ Structure de la Base de Données

### Table `payments` (étendue)

**Nouveaux champs** :
- `payment_type` : `'deposit'` | `'rent'` | `null`
- `property_id` : `integer` (nullable, FK vers `properties`)
- `tenant_id` : `integer` (nullable, FK vers `users`)
- `landlord_id` : `integer` (nullable, FK vers `users`)
- `month` : `string` (nullable, format `YYYY-MM` pour le loyer)
- `paid_at` : `datetime` (nullable, date de confirmation par le bailleur)

**Nouveau statut** :
- `waiting_landlord_confirmation` : Paiement initié par le locataire, en attente de confirmation du bailleur

**Champs modifiés** :
- `contract_id` : maintenant nullable (les paiements peuvent être liés directement à une propriété)

### Table `invoices` (étendue)

**Nouveaux champs** :
- `payment_type` : `'deposit'` | `'rent'` | `null`
- `property_id` : `integer` (nullable, FK vers `properties`)
- `month` : `string` (nullable, format `YYYY-MM` pour le loyer)

**Champs modifiés** :
- `contract_id` : maintenant nullable

---

## 🔧 Règles Métier

### 1. Conditions avant paiement

Une propriété peut recevoir des paiements si et seulement si :
- `properties.price > 0` (loyer défini)
- ET (`properties.security_deposit` OU `properties.deposit_months` défini)

### 2. Calcul de la caution

**PRIORITÉ** : `security_deposit` (si défini et > 0)
**SINON** : `price × deposit_months`

Si aucun calcul possible → erreur métier claire.

### 3. Prévention des doublons

- **Caution** : Un locataire ne peut payer qu'**une seule fois** la caution pour une propriété donnée
- **Loyer** : Un locataire ne peut payer qu'**un seul loyer** pour un mois donné (format `YYYY-MM`)

### 4. Flux de paiement

1. **LOCATAIRE** initie le paiement → statut : `waiting_landlord_confirmation`
2. **BAILLEUR** confirme la réception du cash → statut : `paid`, `paid_at` = maintenant
3. **SYSTÈME** génère automatiquement une facture → statut : `paid`

---

## 🛠️ Endpoints API

### 1. POST /api/payments/initiate

**Rôle** : Locataire

**Body** :
```json
{
  "propertyId": 123,
  "paymentType": "deposit", // ou "rent"
  "paymentMethod": "CASH",
  "month": "2024-01" // OBLIGATOIRE si paymentType = "rent"
}
```

**Réponse** (201) :
```json
{
  "message": "Paiement initié avec succès. En attente de confirmation du bailleur.",
  "data": {
    "id": 456,
    "propertyId": 123,
    "tenantId": 10,
    "landlordId": 5,
    "paymentType": "deposit",
    "paymentMethod": "CASH",
    "amount": 150.00,
    "currency": "USD",
    "status": "waiting_landlord_confirmation",
    "month": null,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "property": { ... },
    "tenant": { ... },
    "landlord": { ... }
  }
}
```

**Erreurs possibles** :
- 400 : Propriété ne peut pas recevoir de paiements (price <= 0 ou caution non définie)
- 400 : Caution déjà payée
- 400 : Loyer déjà payé pour ce mois
- 400 : Mois requis pour le loyer
- 403 : Seuls les locataires peuvent initier un paiement

---

### 2. POST /api/payments/:id/confirm

**Rôle** : Bailleur

**Réponse** (200) :
```json
{
  "message": "Paiement confirmé avec succès. Une facture a été générée.",
  "data": {
    "payment": { ... },
    "invoice": {
      "id": 789,
      "propertyId": 123,
      "tenantId": 10,
      "landlordId": 5,
      "paymentType": "deposit",
      "amount": 150.00,
      "status": "paid",
      "description": "Caution pour Nom de la propriété",
      "month": null,
      "paidAt": "2024-01-15T10:05:00.000Z",
      ...
    }
  }
}
```

**Erreurs possibles** :
- 400 : Paiement déjà confirmé ou statut invalide
- 403 : Vous n'êtes pas autorisé à confirmer ce paiement
- 404 : Paiement introuvable

---

### 3. GET /api/payments/pending

**Rôle** : Bailleur

**Réponse** (200) :
```json
{
  "message": "Paiements en attente récupérés avec succès",
  "data": [
    {
      "id": 456,
      "propertyId": 123,
      "tenantId": 10,
      "landlordId": 5,
      "paymentType": "deposit",
      "amount": 150.00,
      "status": "waiting_landlord_confirmation",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "property": {
        "id": 123,
        "name": "Libanda, Mont-Ngafula",
        ...
      },
      "tenant": {
        "id": 10,
        "fullName": "John Doe",
        ...
      }
    }
  ]
}
```

---

### 4. GET /api/invoices

**Rôle** : Locataire ou Bailleur

**Filtres** :
- `?status=pending` : Filtrer par statut
- `?contractId=123` : Filtrer par contrat (optionnel)

**Réponse** (200) :
```json
{
  "message": "Factures récupérées avec succès",
  "data": [
    {
      "id": 789,
      "propertyId": 123,
      "tenantId": 10,
      "landlordId": 5,
      "paymentType": "deposit",
      "amount": 150.00,
      "status": "paid",
      "description": "Caution pour Nom de la propriété",
      "month": null,
      "paidAt": "2024-01-15T10:05:00.000Z",
      "createdAt": "2024-01-15T10:05:00.000Z",
      "property": {
        "id": 123,
        "name": "Libanda, Mont-Ngafula",
        "address": "...",
        ...
      },
      "tenant": { ... },
      "landlord": { ... }
    },
    {
      "id": 790,
      "propertyId": 123,
      "paymentType": "rent",
      "month": "2024-01",
      "description": "Loyer du mois de janvier 2024 - Nom de la propriété",
      ...
    }
  ]
}
```

**Note** : Les factures sont triées par date de création décroissante (plus récentes en premier).

---

## 📱 Frontend Flutter - Implémentation

### 1. Modèles

**Payment Model** :
```dart
class Payment {
  final int id;
  final int? propertyId;
  final int? tenantId;
  final int? landlordId;
  final PaymentType? paymentType; // 'deposit' | 'rent'
  final PaymentMethod paymentMethod;
  final double amount;
  final String currency;
  final PaymentStatus status;
  final String? month; // Format: YYYY-MM
  final DateTime? paidAt;
  final DateTime createdAt;
  final Property? property;
  final User? tenant;
  final User? landlord;
  
  // ... fromJson, etc.
}

enum PaymentType {
  deposit,
  rent;
  
  String get label {
    switch (this) {
      case PaymentType.deposit:
        return 'Caution';
      case PaymentType.rent:
        return 'Loyer';
    }
  }
}

enum PaymentStatus {
  pending,
  paid,
  failed,
  waitingLandlordConfirmation;
  
  String get label {
    switch (this) {
      case PaymentStatus.pending:
        return 'En attente';
      case PaymentStatus.paid:
        return 'Payé';
      case PaymentStatus.failed:
        return 'Échoué';
      case PaymentStatus.waitingLandlordConfirmation:
        return 'En attente de confirmation du bailleur';
    }
  }
}
```

**Invoice Model** (étendu) :
```dart
class Invoice {
  // ... champs existants
  final PaymentType? paymentType;
  final int? propertyId;
  final String? month;
  final Property? property;
  
  // ... fromJson, etc.
}
```

### 2. Service API

**PaymentService** :
```dart
class PaymentService {
  // Initier un paiement
  Future<Payment> initiatePayment({
    required int propertyId,
    required PaymentType paymentType,
    String? month, // Requis si paymentType = rent
  }) async {
    final response = await _apiClient.post('/api/payments/initiate', {
      'propertyId': propertyId,
      'paymentType': paymentType == PaymentType.deposit ? 'deposit' : 'rent',
      'paymentMethod': 'CASH',
      if (month != null) 'month': month,
    });
    return Payment.fromJson(response['data']);
  }
  
  // Confirmer un paiement (bailleur)
  Future<Map<String, dynamic>> confirmPayment(int paymentId) async {
    final response = await _apiClient.post('/api/payments/$paymentId/confirm');
    return {
      'payment': Payment.fromJson(response['data']['payment']),
      'invoice': Invoice.fromJson(response['data']['invoice']),
    };
  }
  
  // Lister les paiements en attente (bailleur)
  Future<List<Payment>> getPendingPayments() async {
    final response = await _apiClient.get('/api/payments/pending');
    final List<dynamic> paymentsJson = response['data'];
    return paymentsJson.map((json) => Payment.fromJson(json)).toList();
  }
}
```

### 3. Écran de Paiement

**MakePaymentPage** :
- Afficher les détails de la propriété
- Sélectionner le type : Caution ou Loyer
- Si Loyer : Sélectionner le mois (date picker)
- Afficher le montant calculé
- Bouton "Confirmer le paiement" (pas "Confirmer la visite")
- Après confirmation : Message "Paiement initié. En attente de confirmation du bailleur."

### 4. Écran "Mes factures" (Profil)

**⚠️ IMPORTANT - Ajout dans ProfilePage** :

Dans l'écran "Mon Profil" (`ProfilePage`), ajouter une nouvelle option dans la section **"Général"** :

**Structure actuelle** :
```
Général
├── Paiements
└── Paramètres
```

**Structure à obtenir** :
```
Général
├── Paiements
├── Mes factures  ← NOUVELLE OPTION À AJOUTER
└── Paramètres
```

**Implémentation Flutter** :
- Ajouter un `ListTile` avec :
  - Icône : Document/Facture (ex: `Icons.receipt` ou `Icons.description`)
  - Titre : "Mes factures"
  - Sous-titre optionnel : "Consulter vos factures"
  - Chevron de navigation (→)
- Au clic : Navigation vers `MyInvoicesPage`

**MyInvoicesPage** :
- Liste des factures avec :
  - **Propriété** : Nom de la propriété
  - **Type** : Badge "Caution" ou "Loyer du mois de {mois}"
  - **Montant** : `{amount} USD`
  - **Méthode** : "Paiement en espèces"
  - **Statut** : Badge coloré
  - **Date** : Date de création
- Tri : Plus récentes en premier
- Clic → Navigation vers `InvoiceDetailsPage`

### 5. Écran de Confirmation (Bailleur)

**PendingPaymentsPage** :
- Liste des paiements en attente
- Pour chaque paiement :
  - Détails (propriété, locataire, montant, type)
  - Bouton "Confirmer le paiement"
- Après confirmation : Message "Paiement confirmé. Une facture a été générée."

---

## 🎨 Textes UX (Français RDC)

- "Paiement en espèces"
- "En attente de confirmation du bailleur"
- "Paiement confirmé"
- "Caution payée"
- "Loyer du mois de {mois}"
- "Facture disponible"
- "Confirmer le paiement" (pas "Confirmer la visite")

---

## ✅ Checklist Frontend

- [ ] Créer les modèles Payment et Invoice (avec nouveaux champs)
- [ ] Créer PaymentService avec les 3 méthodes
- [ ] Mettre à jour MakePaymentPage pour gérer deposit/rent
- [ ] Ajouter sélection de mois pour le loyer
- [ ] Changer "Confirmer la visite" → "Confirmer le paiement"
- [ ] Créer PendingPaymentsPage pour le bailleur
- [ ] Mettre à jour MyInvoicesPage pour afficher paymentType et month
- [ ] Afficher le type de paiement dans les factures
- [ ] Gérer les états (loading, error, empty)
- [ ] Tester le flux complet : initiation → confirmation → facture

---

## 🔍 Tests à Effectuer

1. **Initiation paiement caution** :
   - Vérifier que la caution est calculée correctement
   - Vérifier qu'on ne peut pas payer deux fois
   - Vérifier les notifications

2. **Initiation paiement loyer** :
   - Vérifier que le mois est requis
   - Vérifier qu'on ne peut pas payer deux fois le même mois
   - Vérifier le calcul du montant (price)

3. **Confirmation bailleur** :
   - Vérifier que seul le bailleur peut confirmer
   - Vérifier la génération de facture
   - Vérifier les notifications

4. **Affichage factures** :
   - Vérifier que les factures s'affichent correctement
   - Vérifier le tri (plus récentes en premier)
   - Vérifier l'affichage du type et du mois

---

## 📝 Notes Techniques

- Les paiements sont liés directement aux propriétés (pas besoin de contrat)
- Le statut `waiting_landlord_confirmation` est spécifique aux paiements cash
- Les factures sont générées automatiquement après confirmation
- Les notifications sont envoyées à chaque étape
- Le système est extensible pour ajouter Mobile Money plus tard
