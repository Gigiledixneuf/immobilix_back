# Fix WebSocket Initialization Error

## Problème
Erreur : `TypeError: server.ready is not a function` dans `start/websocket.ts:8`

## Cause
Le fichier `start/websocket.ts` utilisait `server.ready()` qui n'existe pas dans AdonisJS 6.

## Solution
L'initialisation WebSocket se fait maintenant directement dans `bin/server.ts` après le démarrage du serveur HTTP.

### Fichiers modifiés
- ✅ `bin/server.ts` - Initialisation WebSocket dans `.then()` après `.start()`
- ✅ `start/websocket.ts` - SUPPRIMÉ
- ✅ `providers/websocket_provider.ts` - SUPPRIMÉ
- ✅ `adonisrc.ts` - Pas de référence à websocket dans les preloads

### Comment ça marche maintenant
1. Le serveur HTTP démarre avec `.httpServer().start()`
2. Une fois démarré, `.then()` récupère le serveur HTTP
3. WebSocket est initialisé avec ce serveur HTTP

## Si l'erreur persiste
1. Nettoyer le cache Node.js : Supprimer `node_modules/.cache` si existe
2. Redémarrer le serveur
3. Vérifier qu'aucun fichier `start/websocket.*` n'existe

## Test
```bash
node ace serve
# ou
npm run dev
```

Le serveur devrait démarrer sans erreur et afficher :
```
✅ WebSocket service initialized successfully
```

