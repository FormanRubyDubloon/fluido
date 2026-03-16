import { v4 as uuidv4 } from "uuid";

/**
 * Generate a new UUID v4.
 *
 * All entity IDs in Fluido use UUIDs rather than auto-increment integers.
 * This is a deliberate choice for future sync compatibility — when user
 * accounts and cloud sync arrive, UUIDs can be generated on any device
 * without coordination.
 */
export function newId(): string {
  return uuidv4();
}
