import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface ProfilePatch {
  name?: string;
  email?: string;
  phone?: string;
  gender?: string;
  dob?: string; // ISO date
  photoUrl?: string;
  locale?: string;
}

/** Normalise an Indian mobile to canonical 10 digits (strip +91 / spaces). */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').slice(-10);
}

/**
 * Customer profile read/update (FR-1.4). All operations are scoped to the
 * authenticated customer id (ownership enforced at the service boundary,
 * SECURITY-08 / BR-10).
 */
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(customerId: string) {
    const c = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        gender: true,
        dob: true,
        photoUrl: true,
        locale: true,
        status: true,
      },
    });
    if (!c) throw new NotFoundException('Customer not found');
    return c;
  }

  async update(customerId: string, patch: ProfilePatch) {
    await this.get(customerId); // ensures existence

    const data: {
      name?: string;
      email?: string;
      phone?: string;
      gender?: string;
      dob?: Date;
      photoUrl?: string;
      locale?: string;
    } = {
      name: patch.name,
      gender: patch.gender,
      dob: patch.dob ? new Date(patch.dob) : undefined,
      photoUrl: patch.photoUrl,
      locale: patch.locale,
    };

    // Adding/changing a contact identifier: normalise and ensure it is not
    // already linked to a DIFFERENT customer (email & phone are unique).
    if (patch.email !== undefined) {
      const email = patch.email.trim().toLowerCase();
      const owner = await this.prisma.customer.findUnique({ where: { email } });
      if (owner && owner.id !== customerId) {
        throw new ConflictException('That email is already linked to another account.');
      }
      data.email = email;
    }
    if (patch.phone !== undefined) {
      const phone = normalizePhone(patch.phone);
      const owner = await this.prisma.customer.findUnique({ where: { phone } });
      if (owner && owner.id !== customerId) {
        throw new ConflictException('That mobile number is already linked to another account.');
      }
      data.phone = phone;
    }

    return this.prisma.customer.update({
      where: { id: customerId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        gender: true,
        dob: true,
        photoUrl: true,
        locale: true,
      },
    });
  }
}
