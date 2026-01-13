# Changements Frontend Requis

## 🔴 URGENT - Correction du texte du bouton de paiement

### Écran : Effectuer un Paiement (Make Payment Screen)

**Problème identifié** :
Le bouton de confirmation affiche actuellement **"Confirmer la visite"** alors qu'il devrait afficher **"Confirmer le paiement"**.

**Fichier à modifier** : 
- `lib/pages/payment/make_payment_page.dart` (ou équivalent)
- Ou le widget du bouton de confirmation

**Changement requis** :
```dart
// AVANT
ElevatedButton(
  child: Text('Confirmer la visite'),
  onPressed: () { ... },
)

// APRÈS
ElevatedButton(
  child: Text('Confirmer le paiement'),
  onPressed: () { ... },
)
```

**Raison** :
- L'utilisateur est en train de confirmer un **paiement**, pas une visite
- Le contexte est clairement celui d'un paiement (montant, méthode de paiement)
- La cohérence UX exige que le bouton reflète l'action réelle

---

## 📋 Autres changements requis pour le flux factures

### 1. Message de confirmation après paiement

Après un paiement cash réussi, afficher :
```
"Votre demande a été enregistrée. Une facture a été générée."
```

Avec deux boutons :
- **"Voir la facture"** → Navigation vers `InvoiceDetailsPage(invoiceId)`
- **"Retour à l'accueil"** → Navigation vers l'écran d'accueil

### 2. Section "Mes factures" dans le Profil

**⚠️ URGENT - Ajout dans ProfilePage** :

Dans l'écran "Mon Profil", ajouter une nouvelle option dans la section **"Général"** :

**Emplacement** : Entre "Paiements" et "Paramètres" dans la section "Général"

**Code Flutter suggéré** :
```dart
// Dans ProfilePage, section "Général"
ListTile(
  leading: Icon(Icons.receipt, color: Colors.blue),
  title: Text('Mes factures'),
  subtitle: Text('Consulter vos factures'),
  trailing: Icon(Icons.chevron_right),
  onTap: () {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => MyInvoicesPage()),
    );
  },
),
```

**MyInvoicesPage** :
- Liste des factures avec :
  - **Propriété** : Nom de la propriété (`invoice.property.name`)
  - **Type** : Badge "Caution" ou "Loyer du mois de {mois}"
  - **Montant** : `${invoice.amount} USD`
  - **Méthode** : "Paiement en espèces"
  - **Statut** : Badge coloré (pending/paid/overdue/cancelled)
  - **Date** : Date de création formatée en français
- Tri : Plus récentes en premier (déjà géré par le backend)
- Clic → Navigation vers `InvoiceDetailsPage`

### 3. Page de détails de facture

Créer `InvoiceDetailsPage` pour afficher :
- Toutes les informations de la facture
- Informations du contrat
- Informations du bailleur
- Statut de paiement

---

## ✅ Checklist

- [ ] **URGENT** : Changer "Confirmer la visite" → "Confirmer le paiement"
- [ ] Mettre à jour le message de confirmation post-paiement
- [ ] Ajouter la section "Mes factures" dans le profil
- [ ] Créer la page de détails de facture
- [ ] Tester le flux complet

---

## 📝 Notes

- Le backend génère automatiquement une facture après un paiement cash
- La réponse API contient `data.invoice` avec l'ID de la facture créée
- Utiliser cet ID pour la navigation vers les détails de la facture
