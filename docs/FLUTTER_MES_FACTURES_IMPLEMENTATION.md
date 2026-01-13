# Implémentation Flutter : "Mes factures" dans le Profil

## 📍 Emplacement exact dans ProfilePage

### Structure actuelle
```
Mon Profil
├── [Bouton] Devenir bailleur
├── Recherche sur la page d'accueil
├── Consultées récemment
├── Favoris
├── Visites précédentes
├── Mes candidatures
├── Général
│   ├── Paiements
│   └── Paramètres
└── Support
```

### Structure à obtenir
```
Mon Profil
├── [Bouton] Devenir bailleur
├── Recherche sur la page d'accueil
├── Consultées récemment
├── Favoris
├── Visites précédentes
├── Mes candidatures
├── Général
│   ├── Paiements
│   ├── Mes factures  ← À AJOUTER ICI
│   └── Paramètres
└── Support
```

---

## 🔧 ÉTAPE 1 : Ajouter l'option dans ProfilePage

### Fichier à modifier
`lib/pages/profile/profile_page.dart` (ou équivalent selon votre structure)

### Code à ajouter

**Localisation** : Dans la section "Général", après le `ListTile` de "Paiements" et avant "Paramètres"

```dart
// Dans la section "Général"
// ... code existant pour "Paiements" ...

// ✅ AJOUTER CETTE OPTION
ListTile(
  leading: Icon(
    Icons.receipt_long, // ou Icons.description
    color: Theme.of(context).primaryColor, // Utiliser la même couleur que les autres icônes
  ),
  title: Text(
    'Mes factures',
    style: TextStyle(
      fontSize: 16,
      fontWeight: FontWeight.w500,
    ),
  ),
  trailing: Icon(
    Icons.chevron_right,
    color: Colors.grey,
  ),
  onTap: () {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => InvoicesScreen(),
      ),
    );
  },
),

// ... code existant pour "Paramètres" ...
```

**Important** :
- Utiliser le même style que les autres `ListTile` de la section "Général"
- Respecter les espacements existants
- Utiliser la même couleur d'icône que "Paiements" et "Paramètres"

---

## 📱 ÉTAPE 2 : Créer l'écran InvoicesScreen

### Fichier à créer
`lib/pages/invoices/invoices_screen.dart`

### Code complet

```dart
import 'package:flutter/material.dart';
import '../models/invoice.dart';
import '../services/invoice_service.dart';
import '../widgets/invoice_list_item.dart';
import '../widgets/empty_state_widget.dart';
import '../widgets/error_state_widget.dart';

class InvoicesScreen extends StatefulWidget {
  const InvoicesScreen({Key? key}) : super(key: key);

  @override
  State<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends State<InvoicesScreen> {
  final InvoiceService _invoiceService = InvoiceService();
  List<Invoice> _invoices = [];
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadInvoices();
  }

  Future<void> _loadInvoices() async {
    if (!mounted) return;
    
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final invoices = await _invoiceService.getMyInvoices();
      if (!mounted) return;
      
      setState(() {
        _invoices = invoices;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      
      setState(() {
        _errorMessage = 'Impossible de charger vos factures. Veuillez réessayer.';
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mes factures'),
        backgroundColor: Theme.of(context).primaryColor,
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (_errorMessage != null) {
      return ErrorStateWidget(
        message: _errorMessage!,
        onRetry: _loadInvoices,
      );
    }

    if (_invoices.isEmpty) {
      return EmptyStateWidget(
        icon: Icons.receipt_long,
        message: 'Aucune facture disponible pour le moment',
      );
    }

    return RefreshIndicator(
      onRefresh: _loadInvoices,
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: _invoices.length,
        itemBuilder: (context, index) {
          return InvoiceListItem(
            invoice: _invoices[index],
            onTap: () {
              // Navigation vers les détails de la facture
              // TODO: Implémenter InvoiceDetailsScreen si nécessaire
              // Navigator.push(
              //   context,
              //   MaterialPageRoute(
              //     builder: (context) => InvoiceDetailsScreen(
              //       invoiceId: _invoices[index].id,
              //     ),
              //   ),
              // );
            },
          );
        },
      ),
    );
  }
}
```

---

## 🧩 ÉTAPE 3 : Créer le modèle Invoice

### Fichier à créer/modifier
`lib/models/invoice.dart`

### Code complet

```dart
class Invoice {
  final int id;
  final int? contractId;
  final int tenantId;
  final int landlordId;
  final double amount;
  final DateTime dueDate;
  final InvoiceStatus status;
  final DateTime? paidAt;
  final String? transactionHash;
  final String? description;
  
  // Nouveaux champs pour les factures de propriété
  final PaymentType? paymentType;
  final int? propertyId;
  final String? month;
  
  final DateTime createdAt;
  final DateTime updatedAt;
  
  // Relations
  final Property? property;
  final User? tenant;
  final User? landlord;
  final Contract? contract;

  Invoice({
    required this.id,
    this.contractId,
    required this.tenantId,
    required this.landlordId,
    required this.amount,
    required this.dueDate,
    required this.status,
    this.paidAt,
    this.transactionHash,
    this.description,
    this.paymentType,
    this.propertyId,
    this.month,
    required this.createdAt,
    required this.updatedAt,
    this.property,
    this.tenant,
    this.landlord,
    this.contract,
  });

  factory Invoice.fromJson(Map<String, dynamic> json) {
    return Invoice(
      id: json['id'] as int,
      contractId: json['contractId'] as int?,
      tenantId: json['tenantId'] as int,
      landlordId: json['landlordId'] as int,
      amount: (json['amount'] as num).toDouble(),
      dueDate: DateTime.parse(json['dueDate'] as String),
      status: InvoiceStatus.fromString(json['status'] as String),
      paidAt: json['paidAt'] != null 
          ? DateTime.parse(json['paidAt'] as String) 
          : null,
      transactionHash: json['transactionHash'] as String?,
      description: json['description'] as String?,
      paymentType: json['paymentType'] != null
          ? PaymentType.fromString(json['paymentType'] as String)
          : null,
      propertyId: json['propertyId'] as int?,
      month: json['month'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      property: json['property'] != null
          ? Property.fromJson(json['property'] as Map<String, dynamic>)
          : null,
      tenant: json['tenant'] != null
          ? User.fromJson(json['tenant'] as Map<String, dynamic>)
          : null,
      landlord: json['landlord'] != null
          ? User.fromJson(json['landlord'] as Map<String, dynamic>)
          : null,
      contract: json['contract'] != null
          ? Contract.fromJson(json['contract'] as Map<String, dynamic>)
          : null,
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

enum PaymentType {
  deposit,
  rent;

  static PaymentType fromString(String value) {
    switch (value) {
      case 'deposit':
        return PaymentType.deposit;
      case 'rent':
        return PaymentType.rent;
      default:
        throw ArgumentError('Invalid PaymentType: $value');
    }
  }

  String get label {
    switch (this) {
      case PaymentType.deposit:
        return 'Caution';
      case PaymentType.rent:
        return 'Loyer';
    }
  }
}
```

---

## 🧩 ÉTAPE 4 : Créer le service InvoiceService

### Fichier à créer
`lib/services/invoice_service.dart`

### Code complet

```dart
import '../models/invoice.dart';
import 'api_client.dart'; // Votre client API existant

class InvoiceService {
  final ApiClient _apiClient;

  InvoiceService([ApiClient? apiClient])
      : _apiClient = apiClient ?? ApiClient();

  /// Récupère toutes les factures de l'utilisateur connecté
  Future<List<Invoice>> getMyInvoices({
    String? status,
    int? contractId,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (status != null) queryParams['status'] = status;
      if (contractId != null) queryParams['contractId'] = contractId.toString();

      final response = await _apiClient.get(
        '/api/invoices',
        queryParams: queryParams,
      );

      final List<dynamic> invoicesJson = response['data'] as List<dynamic>;
      return invoicesJson
          .map((json) => Invoice.fromJson(json as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw Exception('Erreur lors de la récupération des factures: $e');
    }
  }

  /// Récupère une facture spécifique
  Future<Invoice> getInvoice(int invoiceId) async {
    try {
      final response = await _apiClient.get('/api/invoices/$invoiceId');
      return Invoice.fromJson(response['data'] as Map<String, dynamic>);
    } catch (e) {
      throw Exception('Erreur lors de la récupération de la facture: $e');
    }
  }

  /// Récupère les factures en attente
  Future<List<Invoice>> getPendingInvoices() async {
    try {
      final response = await _apiClient.get('/api/invoices/pending');
      final List<dynamic> invoicesJson = response['data'] as List<dynamic>;
      return invoicesJson
          .map((json) => Invoice.fromJson(json as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw Exception('Erreur lors de la récupération des factures en attente: $e');
    }
  }
}
```

---

## 🧩 ÉTAPE 5 : Créer le widget InvoiceListItem

### Fichier à créer
`lib/widgets/invoice_list_item.dart`

### Code complet

```dart
import 'package:flutter/material.dart';
import '../models/invoice.dart';

class InvoiceListItem extends StatelessWidget {
  final Invoice invoice;
  final VoidCallback? onTap;

  const InvoiceListItem({
    Key? key,
    required this.invoice,
    this.onTap,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: 2,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // En-tête : Numéro de facture et statut
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.receipt_long,
                        color: Theme.of(context).primaryColor,
                        size: 24,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Facture #${invoice.id}',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  InvoiceStatusBadge(status: invoice.status),
                ],
              ),
              const SizedBox(height: 12),
              
              // Nom de la propriété
              if (invoice.property != null)
                Text(
                  invoice.property!.name,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: Colors.black87,
                  ),
                ),
              
              const SizedBox(height: 8),
              
              // Type de paiement et montant
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _getPaymentTypeLabel(),
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.grey[700],
                      ),
                    ),
                  ),
                  Text(
                    '${invoice.amount.toStringAsFixed(2)} USD',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.black87,
                    ),
                  ),
                ],
              ),
              
              const SizedBox(height: 8),
              
              // Méthode de paiement et date
              Row(
                children: [
                  Icon(
                    Icons.money_off,
                    size: 14,
                    color: Colors.grey[600],
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'Paiement en espèces',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                  const Spacer(),
                  Text(
                    _formatDate(invoice.createdAt),
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _getPaymentTypeLabel() {
    if (invoice.paymentType == null) {
      return 'Paiement';
    }

    if (invoice.paymentType == PaymentType.deposit) {
      return 'Caution';
    }

    // Loyer avec mois
    if (invoice.month != null) {
      return 'Loyer – ${_formatMonth(invoice.month!)}';
    }

    return 'Loyer';
  }

  String _formatMonth(String month) {
    final monthNames = [
      'Janvier',
      'Février',
      'Mars',
      'Avril',
      'Mai',
      'Juin',
      'Juillet',
      'Août',
      'Septembre',
      'Octobre',
      'Novembre',
      'Décembre',
    ];

    try {
      final parts = month.split('-');
      if (parts.length != 2) return month;

      final year = parts[0];
      final monthNum = int.parse(parts[1]);
      
      if (monthNum < 1 || monthNum > 12) return month;

      return '${monthNames[monthNum - 1]} $year';
    } catch (e) {
      return month;
    }
  }

  String _formatDate(DateTime date) {
    final monthNames = [
      'janvier',
      'février',
      'mars',
      'avril',
      'mai',
      'juin',
      'juillet',
      'août',
      'septembre',
      'octobre',
      'novembre',
      'décembre',
    ];

    return '${date.day} ${monthNames[date.month - 1]} ${date.year}';
  }
}
```

---

## 🧩 ÉTAPE 6 : Créer le widget InvoiceStatusBadge

### Fichier à créer
`lib/widgets/invoice_status_badge.dart`

### Code complet

```dart
import 'package:flutter/material.dart';
import '../models/invoice.dart';

class InvoiceStatusBadge extends StatelessWidget {
  final InvoiceStatus status;

  const InvoiceStatusBadge({
    Key? key,
    required this.status,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: status.color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: status.color,
          width: 1,
        ),
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

---

## 🧩 ÉTAPE 7 : Créer le widget EmptyStateWidget (si non existant)

### Fichier à créer
`lib/widgets/empty_state_widget.dart`

### Code complet

```dart
import 'package:flutter/material.dart';

class EmptyStateWidget extends StatelessWidget {
  final IconData icon;
  final String message;
  final String? subtitle;

  const EmptyStateWidget({
    Key? key,
    required this.icon,
    required this.message,
    this.subtitle,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 64,
              color: Colors.grey[400],
            ),
            const SizedBox(height: 16),
            Text(
              message,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w500,
                color: Colors.grey[700],
              ),
              textAlign: TextAlign.center,
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 8),
              Text(
                subtitle!,
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.grey[600],
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
```

---

## 🧩 ÉTAPE 8 : Créer le widget ErrorStateWidget (si non existant)

### Fichier à créer
`lib/widgets/error_state_widget.dart`

### Code complet

```dart
import 'package:flutter/material.dart';

class ErrorStateWidget extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;

  const ErrorStateWidget({
    Key? key,
    required this.message,
    this.onRetry,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 64,
              color: Colors.red[300],
            ),
            const SizedBox(height: 16),
            Text(
              message,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w500,
                color: Colors.grey[700],
              ),
              textAlign: TextAlign.center,
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Réessayer'),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 12,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
```

---

## 🔗 ÉTAPE 9 : Modèles supplémentaires nécessaires

### Property Model (si non existant)
`lib/models/property.dart`

```dart
class Property {
  final int id;
  final String name;
  final String? address;
  final String? city;
  // ... autres champs selon votre modèle existant

  Property({
    required this.id,
    required this.name,
    this.address,
    this.city,
    // ...
  });

  factory Property.fromJson(Map<String, dynamic> json) {
    return Property(
      id: json['id'] as int,
      name: json['name'] as String,
      address: json['address'] as String?,
      city: json['city'] as String?,
      // ...
    );
  }
}
```

### User Model (si non existant)
`lib/models/user.dart`

```dart
class User {
  final int id;
  final String fullName;
  final String email;
  // ... autres champs

  User({
    required this.id,
    required this.fullName,
    required this.email,
    // ...
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as int,
      fullName: json['fullName'] as String,
      email: json['email'] as String,
      // ...
    );
  }
}
```

---

## 📋 Checklist d'implémentation

### Backend (déjà fait ✅)
- [x] Endpoint GET /api/invoices fonctionnel
- [x] Factures liées aux propriétés
- [x] Champs paymentType et month dans les factures

### Frontend Flutter
- [ ] Ajouter l'option "Mes factures" dans ProfilePage (section "Général")
- [ ] Créer `InvoicesScreen`
- [ ] Créer `InvoiceListItem` widget
- [ ] Créer `InvoiceStatusBadge` widget
- [ ] Créer `EmptyStateWidget` (si non existant)
- [ ] Créer `ErrorStateWidget` (si non existant)
- [ ] Créer/modifier le modèle `Invoice` avec les nouveaux champs
- [ ] Créer `InvoiceService` avec `getMyInvoices()`
- [ ] Ajouter les modèles `Property` et `User` si nécessaires
- [ ] Tester le chargement des factures
- [ ] Tester l'état vide
- [ ] Tester l'état d'erreur
- [ ] Tester le pull-to-refresh
- [ ] Vérifier l'affichage des factures de type "deposit"
- [ ] Vérifier l'affichage des factures de type "rent" avec mois
- [ ] Vérifier le format des dates en français
- [ ] Vérifier la navigation depuis ProfilePage

---

## 🎨 Exemples d'affichage

### Facture de caution
```
┌─────────────────────────────────────┐
│ [📄] Facture #789        [Payée]   │
│                                     │
│ Libanda, Mont-Ngafula              │
│                                     │
│ Caution                    150.00 USD │
│                                     │
│ 💵 Paiement en espèces    15 janv. 2024 │
└─────────────────────────────────────┘
```

### Facture de loyer
```
┌─────────────────────────────────────┐
│ [📄] Facture #790        [Payée]   │
│                                     │
│ Libanda, Mont-Ngafula              │
│                                     │
│ Loyer – Janvier 2024        500.00 USD │
│                                     │
│ 💵 Paiement en espèces    20 janv. 2024 │
└─────────────────────────────────────┘
```

---

## 🔍 Points d'attention

### 1. Format des dates
- Utiliser le format français : "15 janvier 2024"
- Ne pas utiliser "15/01/2024" ou "2024-01-15"

### 2. Format des mois
- Pour les loyers : "Loyer – Janvier 2024" (avec majuscule)
- Utiliser les noms de mois complets en français

### 3. Gestion des valeurs null
- `invoice.property` peut être null (factures liées à un contrat)
- `invoice.month` est null pour les cautions
- Toujours vérifier avec `?.` ou `??`

### 4. Tri
- Le backend retourne déjà les factures triées par date décroissante
- Pas besoin de trier côté Flutter

### 5. Pagination (optionnel)
- Pour l'instant, le backend retourne toutes les factures
- Si nécessaire, ajouter la pagination plus tard

---

## 🚀 Test rapide

Une fois l'implémentation terminée, tester :

1. **Navigation** :
   - Ouvrir "Mon Profil"
   - Vérifier que "Mes factures" apparaît dans "Général"
   - Cliquer sur "Mes factures"
   - Vérifier que l'écran s'ouvre

2. **Chargement** :
   - Vérifier l'affichage du loader
   - Vérifier que les factures s'affichent

3. **États** :
   - Tester avec 0 facture (état vide)
   - Tester avec erreur réseau (état erreur)
   - Tester le pull-to-refresh

4. **Affichage** :
   - Vérifier le format des dates
   - Vérifier l'affichage du type (Caution vs Loyer)
   - Vérifier les badges de statut

---

## 📝 Notes finales

- Le backend est **100% prêt** et fonctionnel
- L'endpoint `/api/invoices` retourne toutes les données nécessaires
- Les factures sont automatiquement générées après confirmation du bailleur
- Le système supporte les factures de caution ET de loyer
- Tous les textes doivent être en français (RDC)

**Prêt pour la production** ✅
