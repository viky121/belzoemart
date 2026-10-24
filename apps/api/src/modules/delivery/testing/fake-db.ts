import type { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * A small in-memory stand-in for the Prisma client, just rich enough for the delivery services:
 * equality, in / notIn / not / lt / lte / gt / gte / contains filters, OR / AND, defaults, ids,
 * and a transaction that rolls every table back when the callback throws. It is for unit tests
 * only; the real triggers and indexes are exercised by the database spec.
 */

type Row = Record<string, any>;
export interface Clock {
  now: Date;
}

function matchValue(actual: unknown, cond: unknown): boolean {
  if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
    const c = cond as Record<string, any>;
    let ok = true;
    if ('in' in c) ok &&= (c.in as unknown[]).includes(actual);
    if ('notIn' in c) ok &&= !(c.notIn as unknown[]).includes(actual);
    if ('not' in c) ok &&= !matchValue(actual, c.not);
    if ('lt' in c) ok &&= actual instanceof Date && actual < c.lt;
    if ('lte' in c) ok &&= actual instanceof Date && actual <= c.lte;
    if ('gt' in c) ok &&= actual instanceof Date && actual > c.gt;
    if ('gte' in c) ok &&= actual instanceof Date && actual >= c.gte;
    if ('contains' in c) ok &&= typeof actual === 'string' && actual.toLowerCase().includes(String(c.contains).toLowerCase());
    return ok;
  }
  if (cond instanceof Date) return actual instanceof Date && actual.getTime() === cond.getTime();
  return actual === cond;
}

export function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (v === undefined) return true;
    if (k === 'OR') return (v as Row[]).some((w) => matches(row, w));
    if (k === 'AND') return (v as Row[]).every((w) => matches(row, w));
    return matchValue(row[k], v);
  });
}

export class Table {
  rows: Row[] = [];
  private seq = 0;

  constructor(
    private readonly prefix: string,
    private readonly clock: Clock,
    private readonly defaults: () => Row = () => ({}),
    private readonly stamps: ('createdAt' | 'updatedAt')[] = ['createdAt'],
  ) {}

  private sort(rows: Row[], orderBy?: Row | Row[]): Row[] {
    const list = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
    return [...rows].sort((a, b) => {
      for (const o of list) {
        const [key, dir] = Object.entries(o)[0] as [string, 'asc' | 'desc'];
        const av = a[key] instanceof Date ? a[key].getTime() : a[key];
        const bv = b[key] instanceof Date ? b[key].getTime() : b[key];
        if (av === bv) continue;
        const cmp = av > bv ? 1 : -1;
        return dir === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }

  async findFirst(args: { where?: Row; orderBy?: Row | Row[] } = {}): Promise<Row | null> {
    return this.sort(this.rows.filter((r) => matches(r, args.where)), args.orderBy)[0] ?? null;
  }

  async findUnique(args: { where: Row }): Promise<Row | null> {
    return this.rows.find((r) => matches(r, args.where)) ?? null;
  }

  async findUniqueOrThrow(args: { where: Row }): Promise<Row> {
    const row = await this.findUnique(args);
    if (!row) throw new Error(`${this.prefix}: record not found`);
    return row;
  }

  async findMany(args: { where?: Row; orderBy?: Row | Row[]; take?: number; skip?: number } = {}): Promise<Row[]> {
    const sorted = this.sort(this.rows.filter((r) => matches(r, args.where)), args.orderBy);
    const from = args.skip ?? 0;
    return sorted.slice(from, args.take === undefined ? undefined : from + args.take);
  }

  async count(args: { where?: Row } = {}): Promise<number> {
    return this.rows.filter((r) => matches(r, args.where)).length;
  }

  async create(args: { data: Row }): Promise<Row> {
    this.clock.now = new Date(this.clock.now.getTime() + 1);
    const row: Row = { id: `${this.prefix}-${++this.seq}`, ...this.defaults(), ...args.data };
    for (const s of this.stamps) row[s] ??= new Date(this.clock.now);
    this.rows.push(row);
    return row;
  }

  async createMany(args: { data: Row[] }): Promise<{ count: number }> {
    for (const d of args.data) await this.create({ data: d });
    return { count: args.data.length };
  }

  async update(args: { where: Row; data: Row }): Promise<Row> {
    const row = this.rows.find((r) => matches(r, args.where));
    if (!row) throw new Error(`${this.prefix}: record to update not found`);
    Object.assign(row, args.data);
    return row;
  }

  async updateMany(args: { where?: Row; data: Row }): Promise<{ count: number }> {
    const hit = this.rows.filter((r) => matches(r, args.where));
    hit.forEach((r) => Object.assign(r, args.data));
    return { count: hit.length };
  }

  async deleteMany(args: { where?: Row } = {}): Promise<{ count: number }> {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !matches(r, args.where));
    return { count: before - this.rows.length };
  }
}

export interface FakeDb {
  prisma: PrismaService;
  clock: Clock;
  t: {
    order: Table;
    orderItem: Table;
    address: Table;
    customer: Table;
    deliveryZonePincode: Table;
    deliveryPartner: Table;
    deliveryJob: Table;
    deliveryAssignment: Table;
    deliveryEvent: Table;
    deliveryOtp: Table;
    shipment: Table;
    trackingEvent: Table;
  };
}

export function createFakeDb(start = new Date('2026-10-23T10:00:00Z')): FakeDb {
  const clock: Clock = { now: start };
  const t = {
    order: new Table('order', clock),
    orderItem: new Table('item', clock),
    address: new Table('addr', clock),
    customer: new Table('cust', clock),
    deliveryZonePincode: new Table('zp', clock),
    deliveryPartner: new Table('partner', clock, () => ({ isActive: true, isOnline: false, maxActiveJobs: 10 })),
    deliveryJob: new Table('job', clock, () => ({ attemptsUsed: 0, otpLockedUntil: null, partnerId: null, currentAssignmentId: null, shipmentId: null, attention: null, acceptDeadlineAt: null, deliveredAt: null, endedAt: null, trackingExpiresAt: null, status: 'new' }), ['createdAt', 'updatedAt']),
    deliveryAssignment: new Table('asg', clock, () => ({ outcome: 'pending', respondedAt: null, reason: null })),
    deliveryEvent: new Table('evt', clock),
    deliveryOtp: new Table('otp', clock, () => ({ status: 'active', sendStatus: 'pending', wrongGuesses: 0, sentAt: null, verifiedAt: null })),
    shipment: new Table('ship', clock, () => ({ status: 'created' }), ['createdAt', 'updatedAt']),
    trackingEvent: new Table('trk', clock),
  };

  const prisma: Record<string, any> = {
    ...t,
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      if (sql.includes('now()')) return [{ now: clock.now }];
      if (sql.includes('FOR UPDATE')) return t.deliveryJob.rows.some((r) => r.id === values[0]) ? [{ id: values[0] }] : [];
      throw new Error(`unexpected raw query: ${sql}`);
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const snapshot = Object.fromEntries(Object.entries(t).map(([k, table]) => [k, table.rows.map((r) => ({ ...r }))]));
      try {
        return await fn(prisma);
      } catch (e) {
        for (const [k, rows] of Object.entries(snapshot)) (t as Record<string, Table>)[k]!.rows = rows;
        throw e;
      }
    },
  };
  // updateMany/update on jobs also refresh updatedAt like Prisma's @updatedAt would
  return { prisma: prisma as unknown as PrismaService, clock, t };
}
