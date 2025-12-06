# 🧪 Guide de Test des Méthodes Hedera

Ce guide vous explique comment tester les nouvelles méthodes Hedera implémentées :
- `updateContractOnChain()` - Mise à jour d'un contrat
- `terminateLease()` - Résiliation d'un contrat

---

## 📋 Prérequis

1. **Variables d'environnement configurées** dans `.env` :
   ```env
   HEDERA_ACCOUNT_ID=0.0.xxxxx
   HEDERA_PRIVATE_KEY=302e... (format DER)
   HEDERA_MASTER_CONTRACT_ID=0.0.xxxxx
   ```

2. **Contrat existant dans la base de données** :
   - Le contrat doit avoir un `id` valide
   - Le contrat doit avoir été créé sur Hedera (avoir un `hederaContractId`)
   - Le contrat doit exister dans le smart contract Hedera

---

## 🚀 Méthode 1 : Test via le Script TypeScript

### Étape 1 : Modifier le script de test

Ouvrez `test_hedera_methods.ts` et modifiez les valeurs de test :

```typescript
// Dans chaque fonction de test, remplacez :
const dbContractId = 1  // ⬅️ ID de votre contrat en DB
```

### Étape 2 : Décommenter les tests à exécuter

Dans la fonction `main()`, décommentez les tests que vous voulez exécuter :

```typescript
const tests = [
  testUpdateContractStatus,      // ✅ Décommentez pour tester
  testUpdateContractEndDate,      // ✅ Décommentez pour tester
  testUpdateContractComplete,     // ✅ Décommentez pour tester
  // testTerminateLease,          // ⚠️ Attention : résilie le contrat !
]
```

### Étape 3 : Exécuter le script

**Option A : Avec tsx (si installé)**
```bash
npx tsx test_hedera_methods.ts
```

**Option B : Après compilation**
```bash
node ace build
node build/test_hedera_methods.js
```

---

## 🎯 Méthode 2 : Test via l'API (Recommandé)

### Test 1 : Mise à jour du statut d'un contrat

**Requête HTTP :**
```http
PUT /api/contracts/:id
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "status": "active"
}
```

**Exemple avec curl :**
```bash
curl -X PUT http://localhost:3333/api/contracts/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}'
```

**Résultat attendu :**
- Le contrat est mis à jour en DB
- Si le contrat a un `hederaContractId`, la méthode `updateContractOnChain()` est appelée
- Le statut est mis à jour sur la blockchain

---

### Test 2 : Mise à jour de la date de fin

**Requête HTTP :**
```http
PUT /api/contracts/:id
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "endDate": "2025-12-31"
}
```

**Exemple avec curl :**
```bash
curl -X PUT http://localhost:3333/api/contracts/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"endDate": "2025-12-31"}'
```

---

### Test 3 : Mise à jour complète (date + statut)

**Requête HTTP :**
```http
PUT /api/contracts/:id
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "endDate": "2025-12-31",
  "status": "renewed"
}
```

---

### Test 4 : Résiliation d'un contrat

**Requête HTTP :**
```http
DELETE /api/contracts/:id
Authorization: Bearer YOUR_TOKEN
```

**Exemple avec curl :**
```bash
curl -X DELETE http://localhost:3333/api/contracts/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**⚠️ ATTENTION :** Cette action :
- Résilie le contrat sur la blockchain (statut → "terminated")
- Supprime le contrat de la base de données

---

## 🔍 Vérification des Résultats

### 1. Vérifier dans les logs du serveur

Regardez les logs de votre serveur AdonisJS. Vous devriez voir :
```
✅ Transaction ID: 0.0.xxxxx@1234567890.123456789
```

### 2. Vérifier sur Hedera Explorer

1. Récupérez le `transactionId` depuis les logs ou la réponse API
2. Ouvrez : https://hashscan.io/testnet/transaction/[TRANSACTION_ID]
3. Vérifiez que la transaction est en statut "SUCCESS"

### 3. Vérifier dans la base de données

```sql
-- Vérifier que le contrat a été mis à jour
SELECT id, status, end_date, hedera_contract_id 
FROM contracts 
WHERE id = 1;

-- Vérifier les logs d'erreur (s'il y en a)
SELECT * FROM logs WHERE contract_id = 1;
```

---

## 🐛 Dépannage

### Erreur : "Missing Hedera credentials"
**Solution :** Vérifiez que toutes les variables d'environnement sont définies dans `.env`

### Erreur : "Lease not found"
**Solution :** 
- Vérifiez que le contrat existe dans la DB avec l'ID fourni
- Vérifiez que le contrat a été créé sur Hedera (a un `hederaContractId`)
- Vérifiez que le `dbContractId` correspond à l'ID du contrat dans le smart contract

### Erreur : "Invalid Hedera private key"
**Solution :** Vérifiez que la clé privée est au format DER correct

### Erreur : "Transaction failed"
**Solution :**
- Vérifiez que votre compte Hedera a suffisamment de HBAR pour les frais
- Vérifiez que le smart contract est bien déployé avec l'ID fourni
- Vérifiez les logs du serveur pour plus de détails

### La transaction semble réussir mais rien ne change
**Solution :**
- Attendez quelques secondes (la blockchain peut avoir un délai)
- Vérifiez sur Hedera Explorer que la transaction est bien confirmée
- Vérifiez que vous utilisez le bon réseau (Testnet vs Mainnet)

---

## 📝 Checklist de Test

- [ ] Variables d'environnement configurées
- [ ] Contrat existant dans la DB avec `hederaContractId`
- [ ] Test de mise à jour du statut → ✅
- [ ] Test de mise à jour de la date → ✅
- [ ] Test de mise à jour complète → ✅
- [ ] Test de résiliation (optionnel) → ✅
- [ ] Vérification sur Hedera Explorer → ✅

---

## 🎓 Exemples de Test avec Postman/Thunder Client

### Collection Postman

1. **Mettre à jour un contrat**
   - Method: `PUT`
   - URL: `http://localhost:3333/api/contracts/1`
   - Headers:
     - `Authorization: Bearer {{token}}`
     - `Content-Type: application/json`
   - Body (raw JSON):
     ```json
     {
       "status": "active",
       "endDate": "2025-12-31"
     }
     ```

2. **Résilier un contrat**
   - Method: `DELETE`
   - URL: `http://localhost:3333/api/contracts/1`
   - Headers:
     - `Authorization: Bearer {{token}}`

---

## 📞 Support

Si vous rencontrez des problèmes :
1. Vérifiez les logs du serveur
2. Vérifiez les logs de Hedera Explorer
3. Vérifiez que votre compte Hedera a suffisamment de HBAR
4. Vérifiez la configuration du smart contract

---

**Bon test ! 🚀**

