# Implémentation : Section "Mes factures" dans l'écran Profil

## 📍 Emplacement dans ProfilePage

### Structure actuelle de l'écran "Mon Profil"

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
│   ├── Mes factures  ← NOUVELLE OPTION À AJOUTER ICI
│   └── Paramètres
└── Support
```

---

## 🎨 Design de l'option "Mes factures"

### Apparence

- **Icône** : `Icons.receipt` ou `Icons.description` (icône de facture/document)
- **Titre** : "Mes factures"
- **Sous-titre optionnel** : "Consulter vos factures" (peut être omis pour cohérence)
- **Chevron** : `Icons.chevron_right` (navigation)
- **Style** : Identique aux autres options de la section "Général"

### Code Flutter

```dart
// Dans ProfilePage, dans la section "Général"
ListTile(
  leading: Icon(
    Icons.receipt,
    color: Theme.of(context).primaryColor, // Ou la couleur utilisée pour les autres icônes
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
        builder: (context) => MyInvoicesPage(),
      ),
    );
  },
),
```

---

## 📱 Page MyInvoicesPage

### Structure de la page

```
MyInvoicesPage
├── AppBar
│   ├── Titre : "Mes factures"
│   └── Bouton retour
├── Body
│   ├── [Loading] → CircularProgressIndicator
│   ├── [Empty] → EmptyStateWidget("Aucune facture disponible")
│   ├── [Error] → ErrorStateWidget + bouton réessayer
│   └── [Success] → ListView des factures
│       └── InvoiceListItem (pour chaque facture)
```

### Widget InvoiceListItem

**Affichage** :
```
┌─────────────────────────────────────┐
│ [Icône] Facture #456                │
│        Libanda, Mont-Ngafula        │
│        Caution • 150.00 USD         │
│        [Badge: Payée]               │
│        15 janvier 2024              │
└─────────────────────────────────────┘
```

**Code Flutter suggéré** :
```dart
class InvoiceListItem extends StatelessWidget {
  final Invoice invoice;

  const InvoiceListItem({required this.invoice});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: ListTile(
        leading: Icon(
          Icons.receipt_long,
          color: Colors.blue,
          size: 32,
        ),
        title: Text(
          'Facture #${invoice.id}',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 16,
          ),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(height: 4),
            Text(
              invoice.property?.name ?? 'Propriété',
              style: TextStyle(fontSize: 14),
            ),
            SizedBox(height: 4),
            Row(
              children: [
                Text(
                  invoice.paymentType == PaymentType.deposit
                      ? 'Caution'
                      : 'Loyer du mois de ${_formatMonth(invoice.month)}',
                  style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                ),
                SizedBox(width: 8),
                Text(
                  '•',
                  style: TextStyle(color: Colors.grey[400]),
                ),
                SizedBox(width: 8),
                Text(
                  '${invoice.amount.toStringAsFixed(2)} USD',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Colors.black87,
                  ),
                ),
              ],
            ),
            SizedBox(height: 4),
            Row(
              children: [
                InvoiceStatusBadge(status: invoice.status),
                Spacer(),
                Text(
                  _formatDate(invoice.createdAt),
                  style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                ),
              ],
            ),
          ],
        ),
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => InvoiceDetailsPage(invoiceId: invoice.id),
            ),
          );
        },
      ),
    );
  }

  String _formatMonth(String? month) {
    if (month == null) return '';
    final monthNames = [
      'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
    ];
    final [year, monthNum] = month.split('-');
    final monthIndex = int.parse(monthNum) - 1;
    return '${monthNames[monthIndex]} $year';
  }

  String _formatDate(DateTime date) {
    final monthNames = [
      'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
    ];
    return '${date.day} ${monthNames[date.month - 1]} ${date.year}';
  }
}
```

---

## 🔄 Flux de données

### 1. Chargement des factures

**Service API** :
```dart
class InvoiceService {
  final ApiClient _apiClient;

  InvoiceService(this._apiClient);

  Future<List<Invoice>> getMyInvoices() async {
    final response = await _apiClient.get('/api/invoices');
    final List<dynamic> invoicesJson = response['data'];
    return invoicesJson.map((json) => Invoice.fromJson(json)).toList();
  }
}
```

### 2. Gestion des états

**MyInvoicesPage avec Provider/Bloc** :
```dart
class MyInvoicesPage extends StatefulWidget {
  @override
  _MyInvoicesPageState createState() => _MyInvoicesPageState();
}

class _MyInvoicesPageState extends State<MyInvoicesPage> {
  final InvoiceService _invoiceService = InvoiceService(ApiClient());
  List<Invoice> _invoices = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadInvoices();
  }

  Future<void> _loadInvoices() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final invoices = await _invoiceService.getMyInvoices();
      setState(() {
        _invoices = invoices;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Erreur lors du chargement des factures';
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Mes factures'),
      ),
      body: _isLoading
          ? Center(child: CircularProgressIndicator())
          : _error != null
              ? ErrorStateWidget(
                  message: _error!,
                  onRetry: _loadInvoices,
                )
              : _invoices.isEmpty
                  ? EmptyStateWidget(
                      message: 'Aucune facture disponible',
                      icon: Icons.receipt_long,
                    )
                  : RefreshIndicator(
                      onRefresh: _loadInvoices,
                      child: ListView.builder(
                        itemCount: _invoices.length,
                        itemBuilder: (context, index) {
                          return InvoiceListItem(invoice: _invoices[index]);
                        },
                      ),
                    ),
    );
  }
}
```

---

## ✅ Checklist d'implémentation

- [ ] **URGENT** : Ajouter l'option "Mes factures" dans ProfilePage (section "Général")
- [ ] Créer la page `MyInvoicesPage`
- [ ] Créer le widget `InvoiceListItem`
- [ ] Créer le widget `InvoiceStatusBadge`
- [ ] Créer le service `InvoiceService` avec la méthode `getMyInvoices()`
- [ ] Mettre à jour le modèle `Invoice` pour inclure `paymentType`, `propertyId`, `month`, `property`
- [ ] Gérer les états (loading, empty, error)
- [ ] Implémenter le pull-to-refresh
- [ ] Tester avec des factures de type "deposit" et "rent"
- [ ] Vérifier l'affichage du mois pour les loyers
- [ ] Tester la navigation vers `InvoiceDetailsPage`

---

## 🎨 Exemples de données à afficher

### Facture de caution
```
Facture #789
Libanda, Mont-Ngafula
Caution • 150.00 USD
[Badge: Payée]
15 janvier 2024
```

### Facture de loyer
```
Facture #790
Libanda, Mont-Ngafula
Loyer du mois de janvier 2024 • 500.00 USD
[Badge: Payée]
20 janvier 2024
```

---

## 📝 Notes importantes

- Les factures sont déjà triées par date de création décroissante côté backend
- Le backend retourne les relations `property`, `tenant`, `landlord` préchargées
- Utiliser le format de date français : "15 janvier 2024" (pas "15/01/2024")
- Le statut "pending" pour les paiements cash signifie "à payer lors de la visite"
- Les factures sont générées automatiquement après confirmation du bailleur
