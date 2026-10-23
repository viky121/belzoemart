import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from './password.service';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateBase32Secret(bytes = 20): string {
  const buf = randomBytes(bytes);
  let bits = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

/**
 * Admin user administration (FR-13.1). Creating admins, assigning roles, and
 * enabling TOTP MFA. All operations are performed by an already-authorized
 * super_admin (enforced at the controller via @Roles).
 */
@Injectable()
export class AdminUserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async create(input: { email: string; name: string; password: string }) {
    const existing = await this.prisma.adminUser.findUnique({ where: { email: input.email } });
    if (existing) throw new BadRequestException('Admin with this email already exists');
    return this.prisma.adminUser.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await this.passwords.hash(input.password),
      },
      select: { id: true, email: true, name: true },
    });
  }

  async assignRole(adminUserId: string, roleName: string) {
    const [admin, role] = await Promise.all([
      this.prisma.adminUser.findUnique({ where: { id: adminUserId } }),
      this.prisma.role.findUnique({ where: { name: roleName } }),
    ]);
    if (!admin) throw new NotFoundException('Admin not found');
    if (!role) throw new NotFoundException('Role not found');
    await this.prisma.adminUserRole.upsert({
      where: { adminUserId_roleId: { adminUserId, roleId: role.id } },
      update: {},
      create: { adminUserId, roleId: role.id },
    });
  }

  /** Provision a TOTP secret; the returned otpauth URL is shown once for QR setup. */
  async enableMfa(adminUserId: string): Promise<{ otpauthUrl: string }> {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminUserId } });
    if (!admin) throw new NotFoundException('Admin not found');
    const secret = generateBase32Secret();
    await this.prisma.adminUser.update({
      where: { id: adminUserId },
      data: { mfaSecret: secret, mfaEnabled: true },
    });
    const label = encodeURIComponent(`Belzo eMart:${admin.email}`);
    return { otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=Belzo%20eMart` };
  }
}
