# 🧪 Comment Tester les Méthodes Hedera

## ✅ Ce qui a été créé

1. **Script de test** : `test_hedera_methods.ts`
   - Tests unitaires pour toutes les nouvelles méthodes
   - Vérification des variables d'environnement
   - Affichage coloré des résultats

2. **Guide complet** : `TEST_HEDERA_GUIDE.md`
   - Instructions détaillées
   - Exemples avec curl et Postman
   - Dépannage

---

## 🚀 Méthode Rapide : Test via l'API (Recommandé)

### Prérequis
1. Votre serveur backend doit être démarré : `npm run dev`
2. Vous devez être authentifié (avoir un token)
3. Vous devez avoir un contrat existant dans la DB avec un `hederaContractId`

### Test 1 : Mettre à jour le statut d'un contrat

```bash
# Remplacez :
# - YOUR_TOKEN par votre token d'authentification
# - 1 par l'ID de votre contrat

curl -X PUT http://localhost:3333/api/contracts/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}'
```

**Résultat attendu :**
```json
{
  "message": "Contrat mis à jour avec succès",
  "data": {
    "id": 1,
    "status": "active",
    ...
  }
}
```

**Vérification :**
- Regardez les logs du serveur : vous devriez voir le `transactionId` Hedera
- Si une erreur Hedera se produit, elle sera loggée mais n'empêchera pas la mise à jour en DB

---

### Test 2 : Mettre à jour la date de fin

```bash
curl -X PUT http://localhost:3333/api/contracts/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"endDate": "2025-12-31"}'
```

---

### Test 3 : Résilier un contrat

```bash
curl -X DELETE http://localhost:3333/api/contracts/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**⚠️ ATTENTION :** Cette action va :
1. Résilier le contrat sur Hedera (statut → "terminated")
2. Supprimer le contrat de la base de données

---

## 🔍 Comment vérifier que ça fonctionne

### 1. Vérifier dans les logs du serveur

Quand vous faites un PUT ou DELETE, regardez la console. Vous devriez voir :

```
✅ Succès : Transaction ID: 0.0.xxxxx@1234567890.123456789
```

OU en cas d'erreur :

```
❌ Erreur lors de la mise à jour du contrat Hedera: [message d'erreur]
```

**Note :** Les erreurs Hedera n'empêchent pas la mise à jour en DB, elles sont juste loggées.

---

### 2. Vérifier sur Hedera Explorer

1. Récupérez le `transactionId` depuis les logs
2. Ouvrez : https://hashscan.io/testnet/transaction/[TRANSACTION_ID]
3. Vérifiez que la transaction est en statut "SUCCESS"

---

### 3. Vérifier dans la base de données

```sql
-- Vérifier que le contrat existe et a un hederaContractId
SELECT id, status, end_date, hedera_contract_id 
FROM contracts 
WHERE id = 1;
```

---

## 🐛 Problèmes courants

### ❌ Erreur : "Lease not found" (dans les logs Hedera)

**Cause :** Le contrat n'existe pas dans le smart contract Hedera

**Solution :**
1. Créez d'abord un contrat via `POST /api/contracts`
2. Vérifiez que la création a généré un `hederaContractId`
3. Ensuite seulement, vous pourrez le mettre à jour

---

### ❌ Erreur : "Missing Hedera credentials"

**Cause :** Variables d'environnement manquantes

**Solution :** Vérifiez votre `.env` :
```env
HEDERA_ACCOUNT_ID=0.0.xxxxx
HEDERA_PRIVATE_KEY=302e...
HEDERA_MASTER_CONTRACT_ID=0.0.xxxxx
```

---

### ❌ Erreur : "Invalid Hedera private key"

**Cause :** Format de clé incorrect

**Solution :** Vérifiez que la clé est au format DER

---

### ⚠️ La transaction réussit mais rien ne change sur Hedera

**Cause :** Délai de confirmation blockchain ou mauvais réseau

**Solution :**
1. Attendez 10-30 secondes
2. Vérifiez que vous êtes sur Testnet (pas Mainnet)
3. Vérifiez que le smart contract est bien déployé

---

## 📝 Checklist de Test

Avant de tester, vérifiez :

- [ ] Serveur backend démarré (`npm run dev`)
- [ ] Variables d'environnement configurées (`.env`)
- [ ] Authentification fonctionnelle (token valide)
- [ ] Contrat existant dans la DB avec `hederaContractId`
- [ ] Compte Hedera a suffisamment de HBAR pour les frais

---

## 🎯 Scénario de Test Complet

1. **Créer un contrat** (si vous n'en avez pas)
   ```bash
   POST /api/contracts
   # → Récupérez l'ID du contrat créé
   ```

2. **Mettre à jour le statut**
   ```bash
   PUT /api/contracts/[ID] avec {"status": "active"}
   # → Vérifiez les logs pour le transactionId
   ```

3. **Mettre à jour la date**
   ```bash
   PUT /api/contracts/[ID] avec {"endDate": "2025-12-31"}
   # → Vérifiez sur Hedera Explorer
   ```

4. **Résilier (optionnel)**
   ```bash
   DELETE /api/contracts/[ID]
   # → Vérifiez que le statut est "terminated" sur Hedera
   ```

---

## 📞 Besoin d'aide ?

Si vous rencontrez des problèmes :
1. Vérifiez les logs du serveur (console)
2. Vérifiez `TEST_HEDERA_GUIDE.md` pour plus de détails
3. Vérifiez que votre compte Hedera a des HBAR
4. Vérifiez la configuration du smart contract

---

**Bon test ! 🚀**

