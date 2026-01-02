# 📸 Architecture de Stockage des Photos de Propriétés

## 🎯 Objectif

Organiser les photos de propriétés dans une structure de dossiers claire et scalable, où chaque propriété a son propre dossier dédié.

## 📁 Structure des Fichiers

### Nouvelle Structure (Implémentée)

```
uploads/
  └── properties/
       └── property_<propertyId>/
            ├── img_1.jpg
            ├── img_2.jpg
            ├── img_3.jpg
            ├── img_4.jpg
            └── img_5.jpg
```

### Ancienne Structure (Rétrocompatibilité)

Les anciennes propriétés peuvent encore avoir leurs images directement dans `uploads/properties/`. Le système gère les deux formats.

## 🔧 Implémentation Backend

### Service Utilitaire

**Fichier:** `app/services/property_photo_service.ts`

Service centralisé pour gérer les chemins et le stockage des photos :

- `getPropertyFolderPath(propertyId)`: Retourne le chemin relatif du dossier
- `getPropertyFolderFullPath(propertyId)`: Retourne le chemin absolu complet
- `ensurePropertyFolderExists(propertyId)`: Crée le dossier s'il n'existe pas
- `getPhotoPublicUrl(propertyId, fileName)`: Construit l'URL publique d'une photo

### Upload des Photos

**Fichier:** `app/controllers/Bailleur/properties_controller.ts`

#### Étape 8 (Création) - `handleStep8`

1. Crée automatiquement le dossier `uploads/properties/property_<propertyId>/`
2. Stocke les images avec des noms standardisés : `img_1.jpg`, `img_2.jpg`, etc.
3. Enregistre dans la DB le chemin relatif : `properties/property_<propertyId>/img_1.jpg`

#### Mise à jour - `handleUpdateStep8`

1. Supprime les anciennes photos (fichiers physiques + DB)
2. Recrée le dossier si nécessaire
3. Upload les nouvelles photos avec la même logique

#### Création complète - `handleCompleteCreation`

Utilise la même logique que `handleStep8` pour la cohérence.

### Base de Données

**Table:** `property_photos`

Le champ `photo_url` stocke maintenant le chemin relatif complet :
- **Nouveau format:** `properties/property_44/img_1.jpg`
- **Ancien format (rétrocompatibilité):** `scaled_1000000097.jpg`

## 🌐 Endpoints API

### 1. Récupérer une propriété avec ses photos

**GET** `/api/public/properties/:id`

**Réponse:**
```json
{
  "id": 44,
  "name": "Appartement moderne",
  "image": "/uploads/properties/property_44/img_1.jpg",
  "photos": [
    {
      "id": 1,
      "url": "/uploads/properties/property_44/img_1.jpg",
      "display_order": 0,
      "is_main": true
    },
    {
      "id": 2,
      "url": "/uploads/properties/property_44/img_2.jpg",
      "display_order": 1,
      "is_main": false
    }
  ]
}
```

### 2. Récupérer uniquement les photos d'une propriété

**GET** `/api/public/properties/:id/photos`

**Réponse:**
```json
{
  "property_id": 44,
  "photos": [
    {
      "id": 1,
      "url": "/uploads/properties/property_44/img_1.jpg",
      "display_order": 0,
      "is_main": true
    },
    {
      "id": 2,
      "url": "/uploads/properties/property_44/img_2.jpg",
      "display_order": 1,
      "is_main": false
    }
  ],
  "total": 2
}
```

### 3. Liste des propriétés

**GET** `/api/public/properties`

Retourne la liste avec `image` (photo principale) formatée correctement.

## 📱 Consommation Frontend (Flutter)

### 1. Récupérer les photos depuis l'endpoint principal

```dart
// Dans PropertyDetailPage
final property = await fetchProperty(propertyId);

// Les photos sont déjà dans property['photos']
final photos = property['photos'] as List;
final imageUrls = photos.map((photo) => photo['url'] as String).toList();
```

### 2. Utiliser l'endpoint dédié aux photos

```dart
// GET /api/public/properties/:id/photos
final response = await http.get(
  Uri.parse('$baseUrl/api/public/properties/$propertyId/photos'),
  headers: {'Authorization': 'Bearer $token'},
);

final data = jsonDecode(response.body);
final photos = data['photos'] as List;
final imageUrls = photos.map((photo) => photo['url'] as String).toList();
```

### 3. Construction des URLs

Les URLs retournées par l'API sont déjà complètes :
- Format: `/uploads/properties/property_44/img_1.jpg`
- Pour les utiliser dans Flutter, préfixer avec `baseUrl` :
  ```dart
  final fullUrl = '$baseUrl${photo['url']}';
  ```

### 4. Affichage dans PageView (Galerie)

```dart
PageView.builder(
  itemCount: imageUrls.length,
  itemBuilder: (context, index) {
    return CachedNetworkImage(
      imageUrl: '$baseUrl${imageUrls[index]}',
      fit: BoxFit.cover,
    );
  },
)
```

## 🔄 Rétrocompatibilité

Le système gère automatiquement les deux formats :

1. **Ancien format** (`photo_url = "scaled_1000000097.jpg"`):
   - URL construite: `/uploads/properties/scaled_1000000097.jpg`

2. **Nouveau format** (`photo_url = "properties/property_44/img_1.jpg"`):
   - URL construite: `/uploads/properties/property_44/img_1.jpg`

## 🗑️ Suppression

Lors de la suppression d'une propriété :

1. Supprime tous les fichiers physiques des photos
2. Supprime le dossier `property_<propertyId>/` s'il existe
3. Supprime les enregistrements de la base de données

## ✅ Avantages

1. **Organisation claire**: Chaque propriété a son propre dossier
2. **Scalabilité**: Facile de gérer des milliers de propriétés
3. **Maintenance**: Suppression simple d'une propriété = suppression du dossier
4. **Performance**: Pas de recherche dans un grand dossier unique
5. **Sécurité**: Isolation des fichiers par propriété

## 🚀 Migration des Anciennes Propriétés

Pour migrer les anciennes propriétés vers la nouvelle structure :

1. Créer un script de migration
2. Pour chaque propriété :
   - Créer le dossier `property_<id>/`
   - Déplacer les fichiers
   - Mettre à jour les chemins en DB

**Note:** La rétrocompatibilité permet de ne pas migrer immédiatement, mais c'est recommandé pour la cohérence.
