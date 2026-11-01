import { NotFoundException } from '@nestjs/common';
import { CreateHelpTicketDto } from './dto/create-help-ticket.dto';
import { HelpService } from './help.service';
import { HelpTicketStatus } from './help-ticket.entity';

describe('HelpService', () => {
  const ticketRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    findAndCount: jest.fn(async () => [[], 0]),
    findOne: jest.fn(),
  };
  const service = new HelpService(ticketRepo as never);

  beforeEach(() => jest.clearAllMocks());

  it('lists repository-backed articles', () => {
    expect(service.articles().length).toBeGreaterThan(0);
    expect(service.articles().every((article) => article.source.length > 0)).toBe(true);
  });

  it('trims ticket content and creates tickets in the open state', async () => {
    const dto = {
      subject: '  Need assistance  ',
      description: '  Details here  ',
    } as CreateHelpTicketDto;

    await service.createTicket(dto, 'staff-1');

    expect(ticketRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Need assistance',
        description: 'Details here',
        status: HelpTicketStatus.OPEN,
        createdBy: 'staff-1',
      }),
    );
  });

  it('attributes status changes and records resolution time', async () => {
    const ticket = {
      id: 'ticket-1',
      status: HelpTicketStatus.IN_PROGRESS,
      updatedBy: null,
      resolvedAt: null,
    };
    ticketRepo.findOne.mockResolvedValue(ticket);

    await service.updateTicketStatus('ticket-1', HelpTicketStatus.RESOLVED, 'staff-2');

    expect(ticketRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: HelpTicketStatus.RESOLVED,
        updatedBy: 'staff-2',
        resolvedAt: expect.any(Date),
      }),
    );
  });

  it('clears resolution time when a resolved ticket is reopened', async () => {
    const ticket = {
      id: 'ticket-1',
      status: HelpTicketStatus.RESOLVED,
      updatedBy: 'staff-1',
      resolvedAt: new Date(),
    };
    ticketRepo.findOne.mockResolvedValue(ticket);

    await service.updateTicketStatus('ticket-1', HelpTicketStatus.OPEN, 'staff-2');

    expect(ticketRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: HelpTicketStatus.OPEN, resolvedAt: null }),
    );
  });

  it('returns not found for a missing ticket', async () => {
    ticketRepo.findOne.mockResolvedValue(null);

    await expect(
      service.updateTicketStatus('missing', HelpTicketStatus.OPEN, 'staff-1'),
    ).rejects.toThrow(NotFoundException);
  });
});
