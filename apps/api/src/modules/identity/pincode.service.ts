import { Injectable } from '@nestjs/common';

/**
 * PIN-code → city/state resolution (FR-1.5). Phase 1 ships a small offline
 * lookup by the first digit / known prefixes; a full dataset or India Post API
 * can be plugged in later behind this same interface. Returns null when
 * unknown so the UI can fall back to manual entry.
 */
@Injectable()
export class PincodeService {
  // Minimal seed of well-known metro PINs; extend or replace with a dataset.
  private readonly known: Record<string, { city: string; state: string }> = {
    '110001': { city: 'New Delhi', state: 'Delhi' },
    '400001': { city: 'Mumbai', state: 'Maharashtra' },
    '560001': { city: 'Bengaluru', state: 'Karnataka' },
    '600001': { city: 'Chennai', state: 'Tamil Nadu' },
    '700001': { city: 'Kolkata', state: 'West Bengal' },
    '500001': { city: 'Hyderabad', state: 'Telangana' },
    '380001': { city: 'Ahmedabad', state: 'Gujarat' },
    '302001': { city: 'Jaipur', state: 'Rajasthan' },
  };

  resolve(pincode: string): { city: string; state: string } | null {
    return this.known[pincode] ?? null;
  }
}
