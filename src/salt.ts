// Moved to a separate module for easier mocking in tests.
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a random salt for use in obfuscation. The returned value is guaranteed to be a valid
 * UTF-8 string and have enough entropy for obfuscations. Other than that, the output format is not
 * defined.
 *
 * @internal
 */
export function generateSalt() {
  // UUIDv4 has enough entropy for our purposes. Where available, uuid uses crypto.randomUUID(),
  // which uses secure random number generation.
  return uuidv4();
}