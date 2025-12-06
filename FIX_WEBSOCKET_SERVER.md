# Fix WebSocket Server Initialization

## Problème
Erreur : `TypeError: One and only one of the "port", "server", or "noServer" options must be specified`

Cela signifie que le `WebSocketServer` reçoit un objet `undefined` ou invalide au lieu d'un serveur HTTP Node.js.

## Solution
Le serveur HTTP doit être récupéré après le démarrage. Testez le serveur avec les logs de debug pour voir ce que retourne `getHttpServer()`.

## Prochaines étapes
1. Lancer le serveur et vérifier les logs de debug
2. Voir ce que retourne `server.getHttpServer()`
3. Ajuster le code en conséquence

