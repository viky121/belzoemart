import { Module } from '@nestjs/common';
import { SmsModule } from '../../integrations/sms/sms.module';
import { TokenService } from './token.service';
import { PasswordService } from './password.service';
import { RbacService } from './rbac.service';
import { LockoutService } from './lockout.service';
import { OtpService } from './otp.service';
import { SocialAuthService } from './social-auth.service';
import { CustomerAuthService } from './customer-auth.service';
import { ProfileService } from './profile.service';
import { AddressService } from './address.service';
import { PincodeService } from './pincode.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminUserService } from './admin-user.service';
import { AdminRolesService } from './admin-roles.service';
import { AuditLogService } from '../admin/audit-log.service';
import { DataRequestService } from './data-request.service';
import { AdminCustomerService } from './admin-customer.service';
import { AuthController } from './auth.controller';
import { AdminAuthController } from './admin-auth.controller';
import { MeController } from './me.controller';
import { AddressesController } from './addresses.controller';
import { DpdpController } from './dpdp.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminCustomersController } from './admin-customers.controller';

/**
 * Identity domain module (U2). Provides authentication, RBAC, profile/address
 * management, admin auth, and DPDP data-rights. Registered in AppModule (HTTP).
 */
@Module({
  imports: [SmsModule],
  controllers: [
    AuthController,
    AdminAuthController,
    MeController,
    AddressesController,
    DpdpController,
    AdminUsersController,
    AdminCustomersController,
  ],
  providers: [
    TokenService,
    PasswordService,
    RbacService,
    LockoutService,
    OtpService,
    SocialAuthService,
    CustomerAuthService,
    ProfileService,
    AddressService,
    PincodeService,
    AdminAuthService,
    AdminUserService,
    AdminRolesService,
    AuditLogService,
    DataRequestService,
    AdminCustomerService,
  ],
  exports: [RbacService, TokenService, PasswordService, LockoutService],
})
export class IdentityModule {}
