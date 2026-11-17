import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApprovalActionType } from '../../common/enums';
import { CreatePayrollRunDto, PayrollLineDto } from './dto/create-payroll-run.dto';
import { LedgerEntry, LedgerEntryType } from './ledger-entry.entity';
import { PayrollRun } from './payroll-run.entity';
import { PayrollService } from './payroll.service';

describe('PayrollService', () => {
  const runRepo = {
    findOne: jest.fn(),
    findAndCount: jest.fn(async () => [[], 0]),
  };
  const approvals = { assertApproved: jest.fn() };
  let generated = 0;
  const manager = {
    create: jest.fn((_entity: unknown, value: unknown) => ({
      id: `gen-${++generated}`,
      ...(value as Record<string, unknown>),
    })),
    save: jest.fn(async (_entity: unknown, value: unknown) => value),
    update: jest.fn(async () => undefined),
  };
  const dataSource = {
    transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) => fn(manager)),
  };

  const service = new PayrollService(
    runRepo as never,
    approvals as never,
    dataSource as unknown as DataSource,
  );

  const dto = (overrides: Partial<CreatePayrollRunDto> = {}): CreatePayrollRunDto =>
    ({
      periodMonth: '2026-10',
      approvalRequestId: 'apr-1',
      lines: [
        { name: 'Ngozi Adichie', amount: 90000 },
        { name: 'Tunde Bakare', amount: 60000, note: 'half month' },
      ],
      ...overrides,
    }) as CreatePayrollRunDto;

  beforeEach(() => {
    jest.clearAllMocks();
    generated = 0;
    approvals.assertApproved.mockResolvedValue(undefined);
  });

  it('posts a run only against an approved fund-movement request', async () => {
    approvals.assertApproved.mockRejectedValue(
      new NotFoundException('Approval not found or not approved'),
    );

    await expect(service.create(dto(), 'staff-1')).rejects.toThrow(NotFoundException);
    expect(approvals.assertApproved).toHaveBeenCalledWith('apr-1', ApprovalActionType.FUND_MOVEMENT);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('records the run and its payroll ledger entry in one transaction', async () => {
    const run = await service.create(dto(), 'staff-1');

    expect(run.periodMonth).toBe('2026-10');
    expect(run.totalAmount).toBe(150000);
    expect(run.status).toBe('posted');
    expect(run.ledgerEntryId).toBe('gen-2');

    const entry = manager.create.mock.calls.find(([entity]) => entity === LedgerEntry)?.[1];
    expect(entry).toEqual(
      expect.objectContaining({
        type: LedgerEntryType.PAYROLL,
        amount: 150000,
        category: 'payroll 2026-10',
        referenceId: run.id,
        recordedBy: 'staff-1',
      }),
    );
    expect(manager.update).toHaveBeenCalledWith(PayrollRun, 'gen-1', { ledgerEntryId: 'gen-2' });
  });

  it('refuses a run whose lines add up to nothing', async () => {
    await expect(
      service.create(dto({ lines: [{ name: 'X', amount: 0 } as PayrollLineDto] }), 'staff-1'),
    ).rejects.toThrow(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('lists runs newest first and serves a run by id', async () => {
    await service.list(2, 10);
    expect(runRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10, order: { createdAt: 'DESC' } }),
    );

    runRepo.findOne.mockResolvedValueOnce({ id: 'r1' } as never);
    await expect(service.detail('r1')).resolves.toEqual({ id: 'r1' });
    runRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.detail('missing')).rejects.toThrow(NotFoundException);
  });
});
