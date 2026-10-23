import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/auth/public.decorator';
import { FailJobDto, MoveWithLocationDto, PartnerJobsQueryDto, ReasonDto, VerifyOtpDto } from '../dto';
import { JobQueryService } from '../jobs/job-query.service';
import { JobService } from '../jobs/job.service';
import { DeliveryOtpService } from '../otp/delivery-otp.service';
import { CurrentPartner } from '../partners/partner-auth.decorators';
import { PartnerAuthGuard } from '../partners/partner-auth.guard';
import type { AuthenticatedPartner } from '../partners/partner-auth.types';

/**
 * The delivery partner's jobs and the steps of a delivery (DL-2.3, DL-2.4, DL-3, DL-4). The partner id
 * always comes from the token (SP2). Each command answers with the job as the partner now sees it.
 */
@ApiTags('partner')
@Public()
@UseGuards(PartnerAuthGuard)
@Controller('partner/jobs')
export class PartnerJobsController {
  constructor(
    private readonly jobs: JobService,
    private readonly query: JobQueryService,
    private readonly otp: DeliveryOtpService,
  ) {}

  @Get()
  list(@CurrentPartner() partner: AuthenticatedPartner, @Query() q: PartnerJobsQueryDto) {
    return this.query.partnerList(partner.id, q);
  }

  @Get(':id')
  get(@CurrentPartner() partner: AuthenticatedPartner, @Param('id', ParseUUIDPipe) id: string) {
    return this.query.partnerGet(partner.id, id);
  }

  @Post(':id/accept')
  @HttpCode(200)
  async accept(@CurrentPartner() partner: AuthenticatedPartner, @Param('id', ParseUUIDPipe) id: string) {
    await this.jobs.accept(partner.id, id);
    return this.query.partnerGet(partner.id, id);
  }

  /** After a rejection the job is no longer the partner's, so there is nothing to show. */
  @Post(':id/reject')
  @HttpCode(200)
  async reject(@CurrentPartner() partner: AuthenticatedPartner, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    await this.jobs.reject(partner.id, id, dto.reason);
    return { success: true };
  }

  @Post(':id/pickup')
  @HttpCode(200)
  async pickup(@CurrentPartner() partner: AuthenticatedPartner, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveWithLocationDto) {
    await this.jobs.pickUp(partner.id, id, dto.location);
    return this.query.partnerGet(partner.id, id);
  }

  @Post(':id/start')
  @HttpCode(200)
  async start(@CurrentPartner() partner: AuthenticatedPartner, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveWithLocationDto) {
    await this.jobs.start(partner.id, id, dto.location);
    return this.query.partnerGet(partner.id, id);
  }

  @Post(':id/arrive')
  @HttpCode(200)
  async arrive(@CurrentPartner() partner: AuthenticatedPartner, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveWithLocationDto) {
    await this.jobs.arrive(partner.id, id, dto.location);
    return this.query.partnerGet(partner.id, id);
  }

  @Post(':id/fail')
  @HttpCode(200)
  async fail(@CurrentPartner() partner: AuthenticatedPartner, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FailJobDto) {
    await this.jobs.fail(partner.id, id, { reasonCode: dto.reasonCode, note: dto.note, location: dto.location });
    return this.query.partnerGet(partner.id, id);
  }

  @Post(':id/retry')
  @HttpCode(200)
  async retry(@CurrentPartner() partner: AuthenticatedPartner, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveWithLocationDto) {
    await this.jobs.retry(partner.id, id, dto.location);
    return this.query.partnerGet(partner.id, id);
  }

  /** Deliver. The code must have been verified first (POST otp/verify). */
  @Post(':id/complete')
  @HttpCode(200)
  async complete(@CurrentPartner() partner: AuthenticatedPartner, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveWithLocationDto) {
    await this.jobs.complete(partner.id, id, dto.location);
    return this.query.partnerGet(partner.id, id);
  }

  /** The partner types the code the customer gave. Limited to 10 tries a minute on top of the 5-wrong-guess lock. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/otp/verify')
  @HttpCode(200)
  async verifyOtp(@CurrentPartner() partner: AuthenticatedPartner, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VerifyOtpDto) {
    await this.otp.verify(partner.id, id, dto.code);
    return this.query.partnerGet(partner.id, id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/otp/resend')
  @HttpCode(200)
  async resendOtp(@CurrentPartner() partner: AuthenticatedPartner, @Param('id', ParseUUIDPipe) id: string) {
    const { nextAllowedAt } = await this.otp.resend(partner.id, id);
    return { nextAllowedAt, job: await this.query.partnerGet(partner.id, id) };
  }
}
