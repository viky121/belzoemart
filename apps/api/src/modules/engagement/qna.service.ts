import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Product Q&A (FR-3.9). Public read of questions + answers; customers ask. */
@Injectable()
export class QnaService {
  constructor(private readonly prisma: PrismaService) {}

  listForProduct(productId: string) {
    return this.prisma.question.findMany({
      where: { productId },
      include: { answers: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  ask(customerId: string, productId: string, body: string) {
    return this.prisma.question.create({ data: { productId, customerId, body } });
  }

  answer(authorId: string, questionId: string, body: string) {
    return this.prisma.answer.create({ data: { questionId, authorId, body } });
  }
}
