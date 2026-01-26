import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Property from '#models/property'
import User from '#models/user'

export default class PropertySeeder extends BaseSeeder {
  public async run() {
    // Récupérer tous les users qui ont le rôle "bailleur"
    const bailleurs = await User.query().whereHas('roles', (query) => {
      // @ts-ignore
      query.where('name', 'bailleur')
    })

    if (bailleurs.length === 0) {
      console.warn('Aucun bailleur trouvé, impossible de créer des propriétés.')
      return
    }

    // Créer 5 logements avec un bailleur aléatoire
    // Note: Utiliser le fichier d'image existant ou laisser null pour afficher un placeholder
    const propertiesData = [
      {
        name: 'Charmant studio au centre-ville',
        address: '12 rue de la République',
        city: 'Paris',
        latitude: 48.8566,
        longitude: 2.3522,
        formatted_address: '12 rue de la République, Paris, France',
        type: 'studio',
        surface: 28,
        rooms: 1,
        capacity: 1,
        price: 850,
        description: 'Studio moderne proche de toutes commodités, idéal pour étudiant.',
        mainPhotoUrl: 'scaled_Kaalwa Adonai_20250725_104448_0000.jpg', // Utiliser le fichier existant
      },
      {
        name: 'Appartement T2 lumineux',
        address: '45 avenue Victor Hugo',
        city: 'Lyon',
        latitude: 45.764,
        longitude: 4.8357,
        formatted_address: '45 avenue Victor Hugo, Lyon, France',
        type: 'apartment',
        surface: 45,
        rooms: 2,
        capacity: 2,
        price: 1100,
        description: 'Bel appartement avec balcon et vue dégagée, proche métro.',
        mainPhotoUrl: null, // Pas d'image pour cette propriété
      },
      {
        name: 'Maison familiale avec jardin',
        address: '8 impasse des Lilas',
        city: 'Toulouse',
        latitude: 43.6047,
        longitude: 1.4442,
        formatted_address: '8 impasse des Lilas, Toulouse, France',
        type: 'house',
        surface: 120,
        rooms: 5,
        capacity: 6,
        price: 1800,
        description: 'Grande maison avec jardin et garage dans un quartier calme.',
        mainPhotoUrl: null,
      },
      {
        name: 'Loft industriel rénové',
        address: '22 quai du Commerce',
        city: 'Nantes',
        latitude: 47.2184,
        longitude: -1.5536,
        formatted_address: '22 quai du Commerce, Nantes, France',
        type: 'apartment',
        surface: 70,
        rooms: 3,
        capacity: 3,
        price: 1350,
        description: 'Magnifique loft avec poutres apparentes et grande hauteur sous plafond.',
        mainPhotoUrl: null,
      },
      {
        name: 'Studio cosy proche université',
        address: '3 rue Pasteur',
        city: 'Lille',
        latitude: 50.6292,
        longitude: 3.0573,
        formatted_address: '3 rue Pasteur, Lille, France',
        type: 'studio',
        surface: 20,
        rooms: 1,
        capacity: 1,
        price: 650,
        description: 'Petit studio meublé parfait pour étudiant ou jeune actif.',
        mainPhotoUrl: null,
      },
    ]

    for (const property of propertiesData) {
      // Sélection aléatoire d’un bailleur
      const randomBailleur = bailleurs[Math.floor(Math.random() * bailleurs.length)]

      await Property.firstOrCreate(
        { name: property.name },
        {
          ...property,
          user_id: randomBailleur.id,
        }
      )
    }
  }
}
