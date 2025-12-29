# Guide de test Postman pour les messages

## Endpoint : POST /api/messages

### URL
```
POST http://localhost:3333/api/messages
```

### Headers requis
```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

### Body (JSON) - Option 1 : Créer une nouvelle conversation avec recipientId
```json
{
  "recipientId": 2,
  "propertyId": 1,
  "content": "Bonjour, je suis intéressé par votre propriété",
  "type": "text"
}
```

### Body (JSON) - Option 2 : Envoyer un message dans une conversation existante
```json
{
  "conversationId": 1,
  "content": "Salut, comment allez-vous ?",
  "type": "text"
}
```

### Body (JSON) - Option 3 : Créer une conversation sans propriété
```json
{
  "recipientId": 2,
  "content": "Bonjour",
  "type": "text"
}
```

### Notes importantes
- `conversationId` OU `recipientId` est requis (pas les deux en même temps)
- `propertyId` est optionnel, mais doit être fourni si vous voulez lier la conversation à une propriété
- `content` est requis (minimum 1 caractère)
- `type` est optionnel (par défaut: "text")

### Exemples de réponses

#### Succès (201 Created)
```json
{
  "message": "Message envoyé avec succès",
  "data": {
    "id": 1,
    "content": "Bonjour, je suis intéressé par votre propriété",
    "type": "text",
    "senderId": 1,
    "sender": {
      "id": 1,
      "fullName": "John Doe"
    },
    "conversationId": 1,
    "createdAt": "2024-01-15T10:00:00.000Z"
  }
}
```

#### Erreur 400 - Validation
```json
{
  "status": "error",
  "message": "Erreur de validation",
  "code": "VALIDATION_ERROR",
  "errors": {
    "content": ["The content field is required"]
  }
}
```

#### Erreur 500 - Erreur serveur
```json
{
  "status": "error",
  "message": "Erreur lors de l'envoi du message",
  "code": "INTERNAL_SERVER_ERROR",
  "error": "Error message here",
  "stack": "...",
  "details": {
    "name": "Error",
    "code": "ER_DUP_ENTRY",
    "sql": "...",
    "errno": 1062
  }
}
```

### Comment obtenir un token d'authentification

1. **Se connecter** :
   ```
   POST http://localhost:3333/api/login
   Body:
   {
     "email": "user@example.com",
     "password": "password123"
   }
   ```

2. **Copier le token** depuis la réponse :
   ```json
   {
     "type": "bearer",
     "token": "oat_...",
     "expiresAt": "..."
   }
   ```

3. **Utiliser le token** dans le header Authorization :
   ```
   Authorization: Bearer oat_...
   ```

### Vérification des logs backend

Quand vous testez, vérifiez les logs dans la console du serveur backend. Vous devriez voir :
- `MessagesController.store: Starting message creation`
- `MessagesController.store: Payload validated: {...}`
- `MessagesController.store: Looking for conversation {...}`
- `MessagesController.store: Conversation found: X` ou `MessagesController.store: Creating new conversation`
- `MessagesController.store: Message created: X`

Si une erreur se produit, vous verrez :
- `Error in MessagesController.store: ...`
- Les détails de l'erreur (code SQL, errno, etc.)

