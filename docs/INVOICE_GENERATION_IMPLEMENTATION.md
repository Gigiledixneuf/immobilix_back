# Implémentation : Génération automatique de factures après paiement cash

## ✅ Partie Backend - Terminée

### 1. Service de génération de facture

**Fichier** : `app/services/invoice_generation_service.ts`

Le service `InvoiceGenerationService` génère automatiquement une facture après un paiement :
- Vérifie qu'une facture n'existe pas déjà (évite les doublons)
- Récupère les informations du contrat et de la propriété
- Détermine la date d'échéance (date de visite si disponible, sinon +7 jours)
- Crée la facture avec le statut `PENDING`
- Envoie une notification au locataire

### 2. Intégration dans le flux de paiement

**Fichier** : `app/controllers/payments_controller.ts`

Lors d'un paiement cash (`POST /api/payments`), le système :
1. Crée le paiement avec `status: PENDING` et `transactionId: null`
2. Génère automatiquement une facture via `InvoiceGenerationService`
3. Retourne la réponse avec le paiement ET la facture créée

**Réponse API** :
```json
{
  "message": "Réservation de paiement en espèces enregistrée. Une facture a été générée. Le paiement sera effectué lors de la visite.",
  "data": {
    "payment": {
      "id": 123,
      "contractId": 45,
      "amount": 150.00,
      "currency": "USD",
      "paymentMethod": "CASH",
      "status": "pending",
      "transactionId": null,
      ...
    },
    "invoice": {
      "id": 456,
      "contractId": 45,
      "tenantId": 10,
      "landlordId": 5,
      "amount": 150.00,
      "dueDate": "2024-01-15T10:00:00.000Z",
      "status": "pending",
      "description": "Facture pour paiement de dépôt de garantie - Paiement en espèces",
      ...
    }
  }
}
```

### 3. Endpoints disponibles

#### GET /api/invoices
Récupère les factures de l'utilisateur connecté :
- **Locataire** : voit ses propres factures (`tenantId = user.id`)
- **Bailleur** : voit les factures de toutes ses propriétés
- **Filtres** : `?status=pending` ou `?contractId=123`
- **Tri** : par date d'échéance décroissante (plus récentes en premier)

**Réponse** :
```json
{
  "message": "Factures récupérées avec succès",
  "data": [
    {
      "id": 456,
      "contractId": 45,
      "tenantId": 10,
      "landlordId": 5,
      "amount": 150.00,
      "dueDate": "2024-01-15T10:00:00.000Z",
      "status": "pending",
      "description": "Facture pour paiement de dépôt de garantie - Paiement en espèces",
      "paidAt": null,
      "transactionHash": null,
      "createdAt": "2024-01-08T10:00:00.000Z",
      "updatedAt": "2024-01-08T10:00:00.000Z",
      "contract": {
        "id": 45,
        "propertyId": 20,
        "tenantId": 10,
        "currency": "USD",
        ...
        "property": {
          "id": 20,
          "name": "Libanda, Mont-Ngafula",
          ...
        }
      },
      "tenant": { ... },
      "landlord": { ... }
    }
  ]
}
```

#### GET /api/invoices/:id
Récupère les détails d'une facture spécifique (avec permissions).

#### GET /api/invoices/pending
Récupère uniquement les factures en attente de paiement (pour les locataires).

### 4. Modèle Invoice

**Champs importants** :
- `id` : Numéro de facture
- `contractId` : ID du contrat associé
- `tenantId` : ID du locataire
- `landlordId` : ID du bailleur
- `amount` : Montant en USD
- `dueDate` : Date d'échéance
- `status` : `pending`, `paid`, `overdue`, `cancelled`
- `description` : Description de la facture
- `paidAt` : Date de paiement (null si non payée)
- `transactionHash` : Hash de transaction (null pour cash)

---

## 📱 Partie Frontend - À implémenter

### 1. Flux post-paiement cash

**Écran** : Confirmation de paiement (après `POST /api/payments`)

**⚠️ IMPORTANT - Texte du bouton** :
- Le bouton de confirmation doit afficher **"Confirmer le paiement"** et non "Confirmer la visite"
- Ce texte doit être cohérent avec l'action de paiement, pas de visite

**Actions à effectuer** :
1. Vérifier que `response.data.invoice` existe
2. Afficher un message de confirmation :
   ```
   "Votre demande a été enregistrée. Une facture a été générée."
   ```
3. Proposer une action :
   - Bouton "Voir la facture" → Navigation vers `InvoiceDetailsPage(invoiceId: response.data.invoice.id)`
   - Bouton "Retour à l'accueil" → Navigation vers l'accueil

**Code Flutter suggéré** :
```dart
// Après confirmation du paiement
if (response.data['invoice'] != null) {
  final invoiceId = response.data['invoice']['id'];
  // Afficher message de confirmation
  // Proposer navigation vers InvoiceDetailsPage
}
```

### 2. Section "Mes factures" dans le Profil

**Écran** : `ProfilePage`

**Structure** :
```
ProfilePage
├── Informations utilisateur
├── Paramètres
└── Mes factures (nouvelle section)
    └── Liste des factures
        └── InvoiceListItem (cliquable)
            └── Navigation vers InvoiceDetailsPage
```

**Widget InvoiceListItem** :
- Numéro de facture : `#${invoice.id}`
- Date : Format français (ex: "15 janvier 2024")
- Montant : `${invoice.amount} USD`
- Statut : Badge coloré
  - `pending` → Orange "À payer"
  - `paid` → Vert "Payée"
  - `overdue` → Rouge "En retard"
  - `cancelled` → Gris "Annulée"
- Méthode de paiement : "Paiement en espèces" (si cash)

**États à gérer** :
- **Loading** : Afficher un indicateur de chargement
- **Liste vide** : Afficher "Aucune facture disponible"
- **Erreur API** : Afficher un message d'erreur avec possibilité de réessayer

### 3. Page de détails de facture

**Écran** : `InvoiceDetailsPage`

**Informations à afficher** :
- Numéro de facture : `#${invoice.id}`
- Date d'émission : `invoice.createdAt`
- Date d'échéance : `invoice.dueDate`
- Montant : `${invoice.amount} USD`
- Statut : Badge avec couleur
- Description : `invoice.description`
- Méthode de paiement : "Paiement en espèces"
- Informations du contrat :
  - Nom de la propriété : `invoice.contract.property.name`
  - Adresse : `invoice.contract.property.address`
- Informations du bailleur : `invoice.landlord.fullName`

**Actions possibles** :
- Si `status === 'pending'` : Afficher "À payer lors de la visite"
- Si `status === 'paid'` : Afficher "Payée le ${invoice.paidAt}"

### 4. Modèles Flutter

**Invoice Model** :
```dart
class Invoice {
  final int id;
  final int contractId;
  final int tenantId;
  final int landlordId;
  final double amount;
  final DateTime dueDate;
  final InvoiceStatus status;
  final String? description;
  final DateTime? paidAt;
  final String? transactionHash;
  final DateTime createdAt;
  final DateTime updatedAt;
  final Contract? contract;
  final User? tenant;
  final User? landlord;

  Invoice({
    required this.id,
    required this.contractId,
    required this.tenantId,
    required this.landlordId,
    required this.amount,
    required this.dueDate,
    required this.status,
    this.description,
    this.paidAt,
    this.transactionHash,
    required this.createdAt,
    required this.updatedAt,
    this.contract,
    this.tenant,
    this.landlord,
  });

  factory Invoice.fromJson(Map<String, dynamic> json) {
    return Invoice(
      id: json['id'],
      contractId: json['contractId'],
      tenantId: json['tenantId'],
      landlordId: json['landlordId'],
      amount: (json['amount'] as num).toDouble(),
      dueDate: DateTime.parse(json['dueDate']),
      status: InvoiceStatus.fromString(json['status']),
      description: json['description'],
      paidAt: json['paidAt'] != null ? DateTime.parse(json['paidAt']) : null,
      transactionHash: json['transactionHash'],
      createdAt: DateTime.parse(json['createdAt']),
      updatedAt: DateTime.parse(json['updatedAt']),
      contract: json['contract'] != null ? Contract.fromJson(json['contract']) : null,
      tenant: json['tenant'] != null ? User.fromJson(json['tenant']) : null,
      landlord: json['landlord'] != null ? User.fromJson(json['landlord']) : null,
    );
  }
}

enum InvoiceStatus {
  pending,
  paid,
  overdue,
  cancelled;

  static InvoiceStatus fromString(String value) {
    switch (value) {
      case 'pending':
        return InvoiceStatus.pending;
      case 'paid':
        return InvoiceStatus.paid;
      case 'overdue':
        return InvoiceStatus.overdue;
      case 'cancelled':
        return InvoiceStatus.cancelled;
      default:
        return InvoiceStatus.pending;
    }
  }

  String get label {
    switch (this) {
      case InvoiceStatus.pending:
        return 'À payer';
      case InvoiceStatus.paid:
        return 'Payée';
      case InvoiceStatus.overdue:
        return 'En retard';
      case InvoiceStatus.cancelled:
        return 'Annulée';
    }
  }

  Color get color {
    switch (this) {
      case InvoiceStatus.pending:
        return Colors.orange;
      case InvoiceStatus.paid:
        return Colors.green;
      case InvoiceStatus.overdue:
        return Colors.red;
      case InvoiceStatus.cancelled:
        return Colors.grey;
    }
  }
}
```

### 5. Service API

**InvoiceService** :
```dart
class InvoiceService {
  final ApiClient _apiClient;

  InvoiceService(this._apiClient);

  // Récupérer toutes les factures de l'utilisateur
  Future<List<Invoice>> getInvoices({String? status, int? contractId}) async {
    final queryParams = <String, dynamic>{};
    if (status != null) queryParams['status'] = status;
    if (contractId != null) queryParams['contractId'] = contractId;

    final response = await _apiClient.get('/api/invoices', queryParams: queryParams);
    final List<dynamic> invoicesJson = response['data'];
    return invoicesJson.map((json) => Invoice.fromJson(json)).toList();
  }

  // Récupérer une facture spécifique
  Future<Invoice> getInvoice(int invoiceId) async {
    final response = await _apiClient.get('/api/invoices/$invoiceId');
    return Invoice.fromJson(response['data']);
  }

  // Récupérer les factures en attente
  Future<List<Invoice>> getPendingInvoices() async {
    final response = await _apiClient.get('/api/invoices/pending');
    final List<dynamic> invoicesJson = response['data'];
    return invoicesJson.map((json) => Invoice.fromJson(json)).toList();
  }
}
```

### 6. Widgets réutilisables

**InvoiceStatusBadge** :
```dart
class InvoiceStatusBadge extends StatelessWidget {
  final InvoiceStatus status;

  const InvoiceStatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: status.color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: status.color, width: 1),
      ),
      child: Text(
        status.label,
        style: TextStyle(
          color: status.color,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
```

**InvoiceAmountText** :
```dart
class InvoiceAmountText extends StatelessWidget {
  final double amount;
  final String currency;

  const InvoiceAmountText({
    required this.amount,
    this.currency = 'USD',
  });

  @override
  Widget build(BuildContext context) {
    return Text(
      '${amount.toStringAsFixed(2)} $currency',
      style: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.bold,
        color: Colors.black87,
      ),
    );
  }
}
```

---

## 🎨 UX / UI - Recommandations

### Langue
- Tous les textes en français (adapté RDC)
- Format de date : "15 janvier 2024" (pas "15/01/2024")

### Design
- Cohérence avec le reste de l'application
- Montant bien visible (taille de police plus grande, gras)
- Statuts avec badges colorés et clairs
- Aucune information technique exposée (pas de transactionHash, etc.)

### Navigation
- Navigation fluide entre les écrans
- Bouton retour sur chaque page
- Indicateurs de chargement clairs

---

## ✅ Checklist Frontend

- [ ] Mettre à jour l'écran de confirmation de paiement pour afficher le message avec facture
- [ ] Ajouter la section "Mes factures" dans ProfilePage
- [ ] Créer InvoiceListItem widget
- [ ] Créer InvoiceStatusBadge widget
- [ ] Créer InvoiceAmountText widget
- [ ] Créer InvoiceDetailsPage
- [ ] Créer InvoiceService pour les appels API
- [ ] Créer Invoice model
- [ ] Gérer les états (loading, empty, error)
- [ ] Tester le flux complet : paiement → facture → consultation
- [ ] Vérifier la navigation entre les écrans
- [ ] Tester avec différents statuts de facture
- [ ] Vérifier l'affichage sur différentes tailles d'écran

---

## 🔍 Tests à effectuer

1. **Flux paiement cash** :
   - Confirmer un paiement cash
   - Vérifier que la facture est générée
   - Vérifier que le message de confirmation s'affiche
   - Vérifier que la navigation vers la facture fonctionne

2. **Consultation des factures** :
   - Accéder à "Mes factures" depuis le profil
   - Vérifier que la liste s'affiche correctement
   - Vérifier le tri (plus récentes en premier)
   - Vérifier les filtres (si implémentés)

3. **Détails de facture** :
   - Cliquer sur une facture
   - Vérifier que tous les détails s'affichent
   - Vérifier le format des dates
   - Vérifier l'affichage du statut

4. **États d'erreur** :
   - Tester avec réseau lent
   - Tester avec erreur API
   - Vérifier les messages d'erreur
   - Vérifier la possibilité de réessayer

---

## 📝 Notes techniques

- Les factures sont automatiquement liées au contrat et aux utilisateurs
- Le statut `pending` signifie "à payer lors de la visite" pour les paiements cash
- La date d'échéance est la date de visite si disponible, sinon +7 jours
- Les notifications sont envoyées automatiquement au locataire lors de la génération
