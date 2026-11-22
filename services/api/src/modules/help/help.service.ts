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
  keywords?: string[];
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
    id: 'restock',
    title: 'How to restock a material — step by step',
    summary: 'Set the reorder point, receive stock, confirm it, then consume it against a batch.',
    content: [
      'Restocking means receiving material into stock. Stock is never typed in: On hand is calculated from a movement ledger. Purchases add to it; usage and approved adjustments subtract from it. The correct order is always set up → purchase → confirm → use.',
      'Step 1 — Check the material record. Open Purchasing → Materials and click the material. Confirm that Unit is a measure word such as metres, yards or kg — never a number. If it is wrong, click Edit details and correct it, because every quantity you enter is interpreted in this unit.',
      'Step 2 — Set the reorder point. In Edit details, set Reorder at to the level where you want to be warned. The On hand column turns red when stock is at or below that number. A red row is a reminder to reorder, not an error.',
      'Step 3 — Raise the purchase. Go to Purchasing → Material purchases → New purchase. Choose the material, enter Quantity received (whole units in the material\'s unit) and Cost per unit (0 is allowed if unknown). Supplier and note are optional. Click Record purchase.',
      'Step 4 — Approval. The owner\'s purchase is approved instantly and stock is added straight away. If you are staff, the request waits in Approvals for a manager. Approving a request alone does not post the purchase, so the owner should raise purchases to avoid a gap.',
      'Step 5 — Confirm the stock. Return to Purchasing → Materials. On hand should now show what you received, the red warning should clear once you are above the reorder point, and Last unit cost should show the cost you entered. Open the item ledger to see the purchase movement behind the number.',
      'Step 6 — Use the stock. Open Purchasing → Materials → Record usage. Choose the material, a whole Quantity used, and select the Batch. The Batch field is labelled optional but is required if you want to complete that production run.',
      'Step 7 — Complete production. In Production → Queue, open the batch and advance it to Completed. The API refuses completion until at least one usage record is linked to that batch, because finished goods cannot appear in stock without recording what was consumed.',
      'If the physical stock is still wrong, do not edit On hand. Use Warehouses → Cycle counts to record the real count; the difference is posted as an approved adjustment so the audit trail stays intact.',
    ],
    source: 'docs/appendix-requirements/11-Inventory.md',
    keywords: ['purchasing', 'stock', 'count', 'restock', 'reorder', 'material'],
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

  listTickets(
    page = 1,
    limit = 50,
    status?: HelpTicketStatus,
  ): Promise<[HelpTicket[], number]> {
    return this.ticketRepo.findAndCount({
      where: status ? { status } : {},
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
