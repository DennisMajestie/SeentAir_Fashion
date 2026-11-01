import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateHelpTicketDto } from './dto/create-help-ticket.dto';
import { HelpTicket, HelpTicketStatus } from './help-ticket.entity';

export interface HelpArticle {
  id: string;
  title: string;
  summary: string;
  content: string[];
  source: string;
}

const ARTICLES: HelpArticle[] = [
  {
    id: 'orders',
    title: 'Working with customer orders',
    summary: 'Find an order, confirm payment, and move it through fulfilment.',
    content: [
      'Use Orders to review retail, wholesale, in-store and custom orders. The order detail page shows items, payment, status history and delivery information.',
      'Orders must be fully paid before staff can advance the customer-facing status. A paid stock exception must be allocated from landed production or refunded.',
      'Order and payment changes are recorded by the API and reflected in the audit history.',
    ],
    source: 'docs/appendix-requirements/08-Orders-Payments.md',
  },
  {
    id: 'inventory',
    title: 'Inventory and stock counts',
    summary: 'Stock quantities come from an append-only movement ledger.',
    content: [
      'The inventory balance is derived from all movements; it is not a manually overwritten field.',
      'A stock count records the system quantity, the physical count, and any adjustment. Decreases require an approved stock-disposal request.',
      'Use the item ledger to review the movements behind an on-hand quantity.',
    ],
    source: 'docs/appendix-requirements/11-Inventory.md',
  },
  {
    id: 'purchases',
    title: 'Recording a material purchase',
    summary: 'Purchase receipts update material stock and purchasing costs.',
    content: [
      'Purchases are recorded against a material after the required purchasing approval.',
      'Recording a purchase adds a purchase movement to the inventory ledger and the cost to accounting in one transaction.',
      'Supplier profiles are not required; an optional free-text note can be used for context.',
    ],
    source: 'docs/appendix-requirements/03-Raw-Materials.md',
  },
  {
    id: 'access',
    title: 'Access and approvals',
    summary: 'The API enforces role permissions and approval requirements.',
    content: [
      'The navigation only displays sections available to the signed-in role, but the backend is authoritative for every request.',
      'Actions such as purchasing and stock disposal require an approval before they can be completed.',
      'Audit entries capture important changes and the reason supplied by staff.',
    ],
    source: 'docs/appendix-requirements/18-Staff-Access-Control.md',
  },
];

@Injectable()
export class HelpService {
  constructor(
    @InjectRepository(HelpTicket)
    private readonly ticketRepo: Repository<HelpTicket>,
  ) {}

  articles(): HelpArticle[] {
    return ARTICLES;
  }

  listTickets(page = 1, limit = 50): Promise<[HelpTicket[], number]> {
    return this.ticketRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  createTicket(dto: CreateHelpTicketDto, actorId: string): Promise<HelpTicket> {
    return this.ticketRepo.save(
      this.ticketRepo.create({
        subject: dto.subject.trim(),
        description: dto.description.trim(),
        status: HelpTicketStatus.OPEN,
        createdBy: actorId,
        updatedBy: null,
        resolvedAt: null,
      }),
    );
  }

  async updateTicketStatus(
    id: string,
    status: HelpTicketStatus,
    actorId: string,
  ): Promise<HelpTicket> {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException(`Help ticket ${id} not found`);
    ticket.status = status;
    ticket.updatedBy = actorId;
    ticket.resolvedAt = status === HelpTicketStatus.RESOLVED ? new Date() : null;
    return this.ticketRepo.save(ticket);
  }
}
