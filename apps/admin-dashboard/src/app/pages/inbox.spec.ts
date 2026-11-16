import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccessService } from '../access.service';
import {
  ApiService,
  ConversationDetail,
  ConversationSummary,
} from '../api.service';
import { InboxPage, chatChannelLabel, statusMeaningFor, threadFrom } from './inbox.page';

const conversation = (over: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id: '7f1d3a2b-8c4e-4a9b-b1c2-d3e4f5a6b7c8',
  customerId: 'c1',
  customerName: 'Adaeze O.',
  guestName: null,
  guestEmail: null,
  guestPhone: null,
  channel: 'in_platform',
  status: 'open',
  relatedOrderId: null,
  subject: null,
  assigneeId: null,
  lastMessageAt: '2026-11-16T10:00:00.000Z',
  lastMessagePreview: 'Do you ship to Abuja?',
  unreadStaff: 2,
  unreadCustomer: 0,
  createdAt: '2026-11-16T09:00:00.000Z',
  ...over,
});

describe('threadFrom and labels', () => {
  it('prefers the customer name, then guest identity, over a raw id', () => {
    expect(threadFrom(conversation()).who).toBe('Adaeze O.');
    expect(threadFrom(conversation({ customerName: null, guestName: 'Ada Obi' })).who).toBe(
      'Ada Obi',
    );
    expect(
      threadFrom(conversation({ customerName: null, guestName: null, guestEmail: 'a@x.com' }))
        .who,
    ).toBe('a@x.com');
  });

  it('words channels and statuses for staff', () => {
    expect(chatChannelLabel('whatsapp')).toBe('WhatsApp');
    expect(chatChannelLabel('in_platform')).toBe('In-app');
    expect(statusMeaningFor('pending')).toEqual({
      label: 'Waiting on reply',
      tone: 'warning',
    });
    expect(statusMeaningFor('closed').label).toBe('Closed');
  });
});

describe('InboxPage', () => {
  let fixture: ComponentFixture<InboxPage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const detail: ConversationDetail = {
    conversation: conversation({ unreadStaff: 0 }),
    messages: [
      {
        id: 'm1',
        conversationId: conversation().id,
        direction: 'in',
        authorUserId: null,
        authorName: null,
        body: 'Do you ship to Abuja?',
        attachmentUrl: null,
        readAt: '2026-11-16T10:05:00.000Z',
        createdAt: '2026-11-16T10:00:00.000Z',
      },
      {
        id: 'm2',
        conversationId: conversation().id,
        direction: 'out',
        authorUserId: 's1',
        authorName: 'Ada Staff',
        body: 'Yes, nationwide.',
        attachmentUrl: null,
        readAt: null,
        createdAt: '2026-11-16T10:06:00.000Z',
      },
    ],
  };

  const mount = (level: 'view' | 'full' = 'full'): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'threads',
      'threadDetail',
      'replyToThread',
      'markThreadRead',
      'updateThread',
    ]);
    api.threads.and.returnValue(of({ data: [conversation()], total: 1 }));
    api.threadDetail.and.returnValue(of(detail));
    api.replyToThread.and.returnValue(of({}));
    api.markThreadRead.and.returnValue(of({ ok: true }));
    api.updateThread.and.returnValue(of({}));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    TestBed.inject(AccessService).me.set({
      name: 'Tester',
      email: 't@seentair.test',
      role: 'business_owner_admin',
      totpEnabled: false,
      access: { communication: level },
    });
    fixture = TestBed.createComponent(InboxPage);
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  it('lists threads with the unread count and server-side filter', () => {
    mount();
    const cells = [...el().querySelectorAll('se-table tbody tr')];
    expect(cells.length).toBe(1);
    expect(cells[0].textContent).toContain('Adaeze O.');
    expect(api.threads).toHaveBeenCalledWith({ status: undefined, unreadOnly: false, limit: 100 });
  });

  it('applies the status filter by re-reading from the server', () => {
    mount();
    api.threads.calls.reset();
    const select = el().querySelector<HTMLSelectElement>('.se-filter-bar select');
    select!.value = 'open';
    select!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(api.threads).toHaveBeenCalledWith({ status: 'open', unreadOnly: false, limit: 100 });
  });

  it('opens a thread, marks it read, and shows the ordered conversation', () => {
    mount();
    const rowButton = [...el().querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Adaeze O.'),
    )!;
    rowButton.click();
    fixture.detectChanges();

    expect(api.markThreadRead).toHaveBeenCalledWith(conversation().id);
    const bubbles = [...el().querySelectorAll('.bubble')];
    expect(bubbles.length).toBe(2);
    expect(bubbles[1].classList.contains('out')).toBe(true);
    expect(bubbles[1].textContent).toContain('Ada Staff');
  });

  it('sends a staff reply and reloads the thread', () => {
    mount();
    const rowButton = [...el().querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Adaeze O.'),
    )!;
    rowButton.click();
    fixture.detectChanges();

    const macro = [...el().querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Send tracking'),
    )!;
    macro.click();
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    fixture.detectChanges();

    const [replyId, replyBody] = api.replyToThread.calls.mostRecent().args;
    expect(replyId).toBe(conversation().id);
    expect(replyBody).toContain('tracking link');
    expect(api.threadDetail).toHaveBeenCalledTimes(2);
  });

  it('hides the composer for view-only roles', () => {
    mount('view');
    const rowButton = [...el().querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Adaeze O.'),
    )!;
    rowButton.click();
    fixture.detectChanges();

    expect(el().querySelector('textarea[name="draft"]')).toBeNull();
    expect(el().textContent).toContain('not reply');
  });

  it('shows the empty state when no conversations exist', () => {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['threads', 'threadDetail', 'markThreadRead']);
    api.threads.and.returnValue(of({ data: [], total: 0 }));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    TestBed.inject(AccessService).me.set({
      name: 'Tester',
      email: 't@seentair.test',
      role: 'business_owner_admin',
      totpEnabled: false,
      access: { communication: 'view' },
    });
    fixture = TestBed.createComponent(InboxPage);
    fixture.detectChanges();
    expect(el().textContent).toContain('No conversations');
  });

  it('surfaces a server failure with a retry path', () => {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['threads', 'threadDetail', 'markThreadRead']);
    api.threads.and.returnValue(throwError(() => ({ error: { message: 'Server down' } })));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    TestBed.inject(AccessService).me.set({
      name: 'Tester',
      email: 't@seentair.test',
      role: 'business_owner_admin',
      totpEnabled: false,
      access: { communication: 'view' },
    });
    fixture = TestBed.createComponent(InboxPage);
    fixture.detectChanges();
    expect(el().textContent).toContain('Server down');
  });
});
