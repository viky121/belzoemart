import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../../common/auth/jwt.types';
import { RequirePermission } from '../../../common/auth/permissions.decorator';
import { AdminJobsQueryDto, AssignJobDto, ChangeContactDto, ReasonDto, ReassignJobDto } from '../dto';
import { JobQueryService } from '../jobs/job-query.service';
import { JobService } from '../jobs/job.service';
import { DeliveryOtpService } from '../otp/delivery-otp.service';

/**
 * Delivery operations for staff: assign an order, watch jobs, step in when something goes wrong
 * (DL-2.1, DL-2.5, DL-7.1). `order_manager` and `super_admin` only (D3). There is no route that
 * marks a job delivered: only the partner can, with the customer's code (BR-D38).
 */
@ApiTags('admin-delivery')
@RequirePermission('delivery.jobs')
@Controller('admin')
export class AdminDeliveryController {
  constructor(
    private readonly jobs: JobService,
    private readonly query: JobQueryService,
    private readonly otp: DeliveryOtpService,
  ) {}

  // ----- from the order page -----

  @Get('orders/:orderId/assign-options')
  assignOptions(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.query.assignOptions(orderId);
  }

  @Post('orders/:orderId/assign')
  @HttpCode(200)
  async assign(@CurrentUser() user: JwtPrincipal, @Param('orderId', ParseUUIDPipe) orderId: string, @Body() dto: AssignJobDto) {
    const { jobId } = await this.jobs.assign(user.sub, orderId, dto.partnerId, dto.note);
    return this.query.adminGet(jobId);
  }

  // ----- dashboard and jobs -----

  @Get('delivery/dashboard')
  dashboard() {
    return this.query.dashboard();
  }

  @Get('delivery/jobs')
  list(@Query() q: AdminJobsQueryDto) {
    return this.query.adminList(q);
  }

  @Get('delivery/jobs/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.query.adminGet(id);
  }

  // ----- staff actions on a job -----

  @Post('delivery/jobs/:id/reassign')
  @HttpCode(200)
  async reassign(@CurrentUser() user: JwtPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReassignJobDto) {
    await this.jobs.reassign(user.sub, id, dto.partnerId, dto.reason);
    return this.query.adminGet(id);
  }

  @Post('delivery/jobs/:id/unassign')
  @HttpCode(200)
  async unassign(@CurrentUser() user: JwtPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    await this.jobs.unassign(user.sub, id, dto.reason);
    return this.query.adminGet(id);
  }

  @Post('delivery/jobs/:id/cancel')
  @HttpCode(200)
  async cancel(@CurrentUser() user: JwtPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    await this.jobs.cancel(user.sub, id, dto.reason);
    return this.query.adminGet(id);
  }

  @Post('delivery/jobs/:id/return')
  @HttpCode(200)
  async markReturned(@CurrentUser() user: JwtPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    await this.jobs.markReturned(user.sub, id, dto.reason);
    return this.query.adminGet(id);
  }

  @Post('delivery/jobs/:id/force-fail')
  @HttpCode(200)
  async forceFail(@CurrentUser() user: JwtPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    await this.jobs.forceFail(user.sub, id, dto.reason);
    return this.query.adminGet(id);
  }

  @Post('delivery/jobs/:id/otp-unlock')
  @HttpCode(200)
  async otpUnlock(@CurrentUser() user: JwtPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.otp.adminUnlock(user.sub, id);
    return this.query.adminGet(id);
  }

  @Post('delivery/jobs/:id/contact')
  @HttpCode(200)
  async changeContact(@CurrentUser() user: JwtPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeContactDto) {
    await this.otp.adminChangeContact(user.sub, id, dto.phone);
    return this.query.adminGet(id);
  }
}
