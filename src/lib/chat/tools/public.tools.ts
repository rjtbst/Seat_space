// src/lib/chat/tools/public.tools.ts
//
// Tools available to everyone, logged in or not. All read-only, all backed
// by existing public-facing server actions — no new queries.

import { exploreLibraries, getAllAmenities } from '@/lib/actions/students/student-discovery'
import type { ToolDefinition } from './types'

export const publicTools: ToolDefinition[] = [
  {
    name: 'searchLibraries',
    description:
      'Search for study libraries on StudySpace by city, area, or a free-text query. Returns library cards with pricing, amenities, and live seat counts.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Free-text search term (library name, area, landmark).' },
        city: { type: 'string', description: 'City name to filter by, if known.' },
        amenities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Amenity names to filter by, e.g. ["AC", "WiFi"].',
        },
      },
    },
    roles: ['guest', 'student', 'owner', 'staff', 'admin'],
    handler: async (args: { search?: string; city?: string; amenities?: string[] }) => {
      const result = await exploreLibraries({
        search: args.search,
        city: args.city,
        amenities: args.amenities,
        limit: 8,
      })
      // Trim to what a chat answer actually needs — avoid dumping full
      // library card payloads (images, all slot configs, etc.) back into
      // the model's context.
      return {
        total: result.total,
        libraries: result.libraries.map((l) => ({
          name: l.name,
          city: l.city,
          area: l.area,
          rating: l.rating,
          available_seats: l.available_seats,
          total_seats: l.total_seats,
          starting_price: l.plans.length ? Math.min(...l.plans.map((p) => p.price)) : null,
          amenities: l.amenities,
          status: l.status,
        })),
      }
    },
  },
  {
    name: 'listAmenities',
    description: 'List all amenity types StudySpace libraries can offer (e.g. AC, WiFi, Locker).',
    parameters: { type: 'object', properties: {} },
    roles: ['guest', 'student', 'owner', 'staff', 'admin'],
    handler: async () => ({ amenities: await getAllAmenities() }),
  },
]
