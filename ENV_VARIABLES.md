# Variables d'Environnement - ImmobilX Backend

Ce document liste toutes les variables d'environnement nécessaires pour le backend ImmobilX.

## Fichier .env.example

Créez un fichier `.env` à la racine du projet backend avec les variables suivantes :

```bash
# ============================================
# Environnement
# ============================================
NODE_ENV=development
PORT=8000
HOST=0.0.0.0
LOG_LEVEL=info
APP_NAME=ImmobilX
APP_KEY=change-this-secret-key-in-production-min-32-characters

# ============================================
# Base de données MySQL
# ============================================
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_DATABASE=immobilix

# ============================================
# Firebase Cloud Messaging (FCM)
# ============================================
# Option 1: Utiliser un fichier JSON de credentials
FIREBASE_CREDENTIALS_PATH=./path/to/firebase-credentials.json

# Option 2: Utiliser les variables d'environnement (alternative)
# FIREBASE_PROJECT_ID=your-project-id
# FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
# FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com

# ============================================
# Hedera Hashgraph
# ============================================
# Pour testnet (développement)
HEDERA_ACCOUNT_ID=0.0.1234567
HEDERA_PRIVATE_KEY=302e020100300506032b657004220420...
HEDERA_MASTER_CONTRACT_ID=0.0.1234567

# Pour mainnet (production), utiliser les clés de production
# HEDERA_NETWORK=mainnet
# HEDERA_ACCOUNT_ID=0.0.production-account
# HEDERA_PRIVATE_KEY=302e020100300506032b657004220420...
# HEDERA_MASTER_CONTRACT_ID=0.0.production-contract

# ============================================
# Flutterwave (Paiements Mobile Money)
# ============================================
# Pour testnet (développement)
FLW_SECRET_KEY=FLWSECK_TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-X
FLW_WEBHOOK_HASH=your-webhook-hash-for-testing

# Pour production, utiliser les clés de production
# FLW_SECRET_KEY=FLWSECK-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-X
# FLW_WEBHOOK_HASH=your-production-webhook-hash
# FLW_PUBLIC_KEY=FLWPUBK-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-X
```

## Variables Requises

### Obligatoires

| Variable | Description | Exemple |
|----------|-------------|---------|
| `NODE_ENV` | Environnement d'exécution | `development`, `production`, `test` |
| `PORT` | Port du serveur HTTP | `8000` |
| `APP_KEY` | Clé secrète pour chiffrement (min 32 caractères) | Généré avec `node ace generate:key` |
| `HOST` | Adresse IP du serveur | `0.0.0.0` |
| `LOG_LEVEL` | Niveau de log | `info`, `debug`, `error`, `warn` |
| `DB_HOST` | Hôte de la base de données | `localhost` |
| `DB_PORT` | Port de la base de données | `3306` |
| `DB_USER` | Utilisateur de la base de données | `root` |
| `DB_DATABASE` | Nom de la base de données | `immobilix` |

### Optionnelles

| Variable | Description | Utilisation |
|----------|-------------|-------------|
| `APP_NAME` | Nom de l'application | Utilisé dans les logs (défaut: "ImmobilX") |
| `DB_PASSWORD` | Mot de passe de la base de données | Si la DB nécessite un mot de passe |

### Firebase (Optionnel - pour notifications FCM)

Au moins une des options suivantes doit être configurée :

**Option 1 - Fichier JSON :**
- `FIREBASE_CREDENTIALS_PATH` : Chemin vers le fichier JSON de credentials Firebase

**Option 2 - Variables d'environnement :**
- `FIREBASE_PROJECT_ID` : ID du projet Firebase
- `FIREBASE_PRIVATE_KEY` : Clé privée du service account (avec `\n` pour les retours à la ligne)
- `FIREBASE_CLIENT_EMAIL` : Email du service account Firebase

### Hedera (Optionnel - pour blockchain)

| Variable | Description | Notes |
|----------|-------------|-------|
| `HEDERA_ACCOUNT_ID` | ID du compte Hedera | Format: `0.0.1234567` |
| `HEDERA_PRIVATE_KEY` | Clé privée du compte (format DER) | Ne jamais commiter |
| `HEDERA_MASTER_CONTRACT_ID` | ID du contrat intelligent principal | Format: `0.0.1234567` |
| `HEDERA_NETWORK` | Réseau Hedera | `testnet` (défaut) ou `mainnet` |

⚠️ **Important pour production :**
- Utiliser le réseau `mainnet` pour la production
- Protéger les clés privées avec un HSM si possible
- Utiliser des comptes séparés pour testnet et mainnet

### Flutterwave (Optionnel - pour paiements)

| Variable | Description | Notes |
|----------|-------------|-------|
| `FLW_SECRET_KEY` | Clé secrète Flutterwave | Format: `FLWSECK_TEST-...` (test) ou `FLWSECK-...` (prod) |
| `FLW_PUBLIC_KEY` | Clé publique Flutterwave (optionnel) | Format: `FLWPUBK-...` |
| `FLW_WEBHOOK_HASH` | Hash pour vérifier les webhooks | Configuré dans le dashboard Flutterwave |

⚠️ **Important pour production :**
- Utiliser les clés de production (`FLWSECK-...` sans `_TEST`)
- Configurer les webhooks dans le dashboard Flutterwave avec l'URL de production
- Ne jamais commiter les clés secrètes

## Génération de APP_KEY

Pour générer une clé sécurisée pour `APP_KEY` :

```bash
node ace generate:key
```

Ou utiliser cette commande Node.js :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Sécurité

1. **Ne jamais commiter le fichier `.env`** dans Git (déjà dans `.gitignore`)
2. **Utiliser des valeurs différentes** pour développement et production
3. **Générer des clés sécurisées** pour la production (APP_KEY, clés privées)
4. **Utiliser un gestionnaire de secrets** en production (AWS Secrets Manager, HashiCorp Vault, etc.)
5. **Rotater les clés régulièrement** (surtout en cas de compromission)

## Notes pour Production

- Configurer toutes les variables d'environnement dans votre plateforme de déploiement
- Utiliser des secrets management tools pour les valeurs sensibles
- Vérifier que toutes les variables obligatoires sont définies
- Tester la configuration avec `node ace serve` avant le déploiement

