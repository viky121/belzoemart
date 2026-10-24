import type { DeliveryAttention, DeliveryStatus } from './status';

/**
 * Response shapes of the delivery API. The partner shapes are deliberately two separate types:
 * before a partner accepts a job they get a preview without name, street address or phone
 * (BR-D70); the detail (BR-D71) is only returned after Accept.
 */

export type DeliveryPaymentMode = 'cod' | 'prepaid';

export interface PartnerView {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  vehicleType: string | null;
  vehicleNumber: string | null;
  isActive: boolean;
  isOnline: boolean;
  lastSeenAt: string | null;
  maxActiveJobs: number;
  activeJobs: number;
  zoneIds: string[];
  mustChangePassword: boolean;
  createdAt: string;
}

export interface PartnerSuggestion {
  partnerId: string;
  name: string;
  isOnline: boolean;
  activeJobs: number;
  maxActiveJobs: number;
  zoneMatch: boolean;
}

/** Job as a partner sees it while the status is `assigned`. */
export interface PartnerJobPreview {
  kind: 'preview';
  id: string;
  code: string;
  status: DeliveryStatus;
  city: string;
  pincode: string;
  itemCount: number;
  paymentMode: DeliveryPaymentMode;
  codAmount: number;
  assignedAt: string;
  responseDeadlineAt: string | null;
}

export interface PartnerJobItem {
  title: string;
  quantity: number;
}

/** Job as a partner sees it after Accept (and in history). */
export interface PartnerJobDetail {
  kind: 'detail';
  id: string;
  code: string;
  status: DeliveryStatus;
  paymentMode: DeliveryPaymentMode;
  codAmount: number;
  itemCount: number;
  items: PartnerJobItem[];
  destName: string;
  destPhone: string;
  address: { line1: string; line2: string | null; city: string; state: string; pincode: string };
  mapsUrl: string;
  attemptsUsed: number;
  maxAttempts: number;
  canRetry: boolean;
  otp: { sendStatus: 'pending' | 'sent' | 'failed' | null; sendsLeft: number; resendAvailableAt: string | null; lockedUntil: string | null; verified: boolean };
  nextActions: string[];
  assignedAt: string;
  deliveredAt: string | null;
}

export type PartnerJobView = PartnerJobPreview | PartnerJobDetail;

export interface AdminJobRow {
  id: string;
  code: string;
  orderId: string;
  status: DeliveryStatus;
  attention: DeliveryAttention | null;
  partnerId: string | null;
  partnerName: string | null;
  partnerActive: boolean | null;
  destCity: string;
  destPincode: string;
  paymentMode: DeliveryPaymentMode;
  codAmount: number;
  attemptsUsed: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminJobEvent {
  id: string;
  event: string;
  fromStatus: DeliveryStatus | null;
  toStatus: DeliveryStatus | null;
  actorKind: 'admin' | 'partner' | 'system';
  actorId: string | null;
  reasonCode: string | null;
  note: string | null;
  attemptNo: number | null;
  createdAt: string;
}

export interface AdminJobDetail extends AdminJobRow {
  destName: string;
  destPhoneMasked: string;
  otpPhoneMasked: string;
  address: { line1: string; line2: string | null; city: string; state: string; pincode: string };
  otpLockedUntil: string | null;
  trackingToken: string;
  events: AdminJobEvent[];
}

export interface DeliveryDashboard {
  counts: Record<DeliveryStatus, number>;
  attention: AdminJobRow[];
  security: { failedLogins24h: number; lockedLogins24h: number; otpLocks24h: number; foreignJobAttempts24h: number };
}
