import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Roles } from '../../common/auth/roles.decorator';
import { AdminUserService } from './admin-user.service';
import { createZodDto } from './zod-dto';

const createAdminSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(128),
});
class CreateAdminDto extends createZodDto(createAdminSchema) {}

const assignRoleSchema = z.object({ roleName: z.string().min(1) });
class AssignRoleDto extends createZodDto(assignRoleSchema) {}

/**
 * Admin user management (FR-13.1). Restricted to super_admin via RolesGuard
 * (function-level authorization enforced server-side, SECURITY-08).
 */
@ApiTags('admin-users')
@ApiBearerAuth()
@Roles('super_admin')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUserService) {}

  @Post()
  create(@Body() dto: CreateAdminDto) {
    return this.adminUsers.create(dto);
  }

  @Post(':id/roles')
  async assignRole(@Param('id') id: string, @Body() dto: AssignRoleDto) {
    await this.adminUsers.assignRole(id, dto.roleName);
    return { success: true };
  }

  @Post(':id/mfa')
  enableMfa(@Param('id') id: string) {
    return this.adminUsers.enableMfa(id);
  }
}
