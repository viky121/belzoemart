import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { strongPasswordSchema } from '@belzo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { AdminRolesService } from './admin-roles.service';
import { AdminUserService } from './admin-user.service';
import { createZodDto } from './zod-dto';

const idSchema = z.string().uuid();

const createStaffSchema = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().min(1).max(120),
  password: strongPasswordSchema,
  roleId: idSchema,
});
class CreateStaffDto extends createZodDto(createStaffSchema) {}

const updateStaffSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    roleId: idSchema.optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .strict();
class UpdateStaffDto extends createZodDto(updateStaffSchema) {}

const passwordSchema = z.object({ password: strongPasswordSchema });
class PasswordDto extends createZodDto(passwordSchema) {}

const roleBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).optional(),
  permissions: z.array(z.string().max(60)).max(100),
});
class CreateRoleDto extends createZodDto(roleBodySchema) {}
class UpdateRoleDto extends createZodDto(roleBodySchema.partial().strict()) {}

/**
 * Staff and staff types (FR-13.1). Only the Super Admin (`staff.manage`) reaches these routes; the permission
 * cannot be given to a staff type, so no one can raise their own access (SECURITY-08).
 */
@ApiTags('admin-users')
@ApiBearerAuth()
@RequirePermission('staff.manage')
@Controller('admin')
export class AdminUsersController {
  constructor(
    private readonly staff: AdminUserService,
    private readonly roles: AdminRolesService,
  ) {}

  // ----- staff -----

  @Get('users')
  listStaff() {
    return this.staff.list();
  }

  @Post('users')
  createStaff(@CurrentUser() user: JwtPrincipal, @Body() dto: CreateStaffDto) {
    return this.staff.create(user.sub, dto);
  }

  @Patch('users/:id')
  updateStaff(@CurrentUser() user: JwtPrincipal, @Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.staff.update(user.sub, id, dto);
  }

  @Post('users/:id/password')
  async resetPassword(@CurrentUser() user: JwtPrincipal, @Param('id') id: string, @Body() dto: PasswordDto) {
    await this.staff.resetPassword(user.sub, id, dto.password);
    return { success: true };
  }

  @Post('users/:id/mfa')
  enableMfa(@CurrentUser() user: JwtPrincipal, @Param('id') id: string) {
    return this.staff.enableMfa(user.sub, id);
  }

  @Delete('users/:id/mfa')
  async disableMfa(@CurrentUser() user: JwtPrincipal, @Param('id') id: string) {
    await this.staff.disableMfa(user.sub, id);
    return { success: true };
  }

  // ----- staff types -----

  @Get('roles')
  listRoles() {
    return this.roles.list();
  }

  @Post('roles')
  createRole(@CurrentUser() user: JwtPrincipal, @Body() dto: CreateRoleDto) {
    return this.roles.create(user.sub, dto);
  }

  @Patch('roles/:id')
  updateRole(@CurrentUser() user: JwtPrincipal, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(user.sub, id, dto);
  }

  @Delete('roles/:id')
  async deleteRole(@CurrentUser() user: JwtPrincipal, @Param('id') id: string) {
    await this.roles.remove(user.sub, id);
    return { success: true };
  }
}
