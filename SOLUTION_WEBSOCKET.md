# Solution pour WebSocket dans AdonisJS 6

## Problème
Le serveur HTTP n'est pas accessible via `server.getHttpServer()` dans AdonisJS 6.

## Solution recommandée
Utiliser une approche différente : initialiser WebSocket après le démarrage du serveur en utilisant l'événement 'listening' ou en accédant au serveur HTTP via l'objet retourné par `.start()`.

## Solution temporaire
Pour l'instant, désactiver WebSocket et le réactiver plus tard une fois que nous aurons trouvé la bonne méthode pour accéder au serveur HTTP.

## Alternative
Utiliser un port séparé pour WebSocket ou attendre qu'AdonisJS expose une méthode pour accéder au serveur HTTP.

