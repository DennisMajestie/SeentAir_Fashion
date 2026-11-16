import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiService, ChatThreadDetail } from './api.service';
import { ChatService } from './chat.service';
import { ChatWidgetComponent } from './chat-widget.component';

const detail = (over: Partial<ChatThreadDetail['conversation']> = {}): ChatThreadDetail => ({
  conversation: {
    id: 'conv-1',
    subject: 'Size question',
    status: 'open',
    lastMessagePreview: 'Yes, we ship nationwide.',
    unreadCustomer: 1,
    ...over,
  },
  messages: [
    {
      id: 'm1',
      direction: 'in',
      authorName: null,
      body: 'Do you ship to Abuja?',
      attachmentUrl: null,
      readAt: null,
      createdAt: '2026-11-16T10:00:00.000Z',
    },
    {
      id: 'm2',
      direction: 'out',
      authorName: 'Ada Staff',
      body: 'Yes, we ship nationwide.',
      attachmentUrl: null,
      readAt: '2026-11-16T10:05:00.000Z',
      createdAt: '2026-11-16T10:05:00.000Z',
    },
  ],
});

describe('ChatWidgetComponent', () => {
  let fixture: ComponentFixture<ChatWidgetComponent>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const mount = (): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'myThreads',
      'startThread',
      'threadDetail',
      'sendMessage',
      'markThreadRead',
      'startGuestThread',
    ]);
    api.myThreads.and.returnValue(of([]));
    api.threadDetail.and.returnValue(of(detail()));
    api.sendMessage.and.returnValue(of({}));
    api.markThreadRead.and.returnValue(of({ ok: true }));
    api.startThread.and.returnValue(of({ id: 'conv-1' }));
    api.startGuestThread.and.returnValue(
      of({ conversation: { id: 'conv-1' }, guestToken: 'guest-token' }),
    );
    TestBed.configureTestingModule({
      imports: [ChatWidgetComponent],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    fixture = TestBed.createComponent(ChatWidgetComponent);
    fixture.detectChanges();
  };

  afterEach(() => {
    localStorage.removeItem('seentair.chat.guest');
    fixture?.destroy();
  });

  it('starts closed with no badge while the panel is hidden', () => {
    mount();
    expect(el().querySelector('.chat-panel')).toBeNull();
    expect(el().querySelector('.chat-float__badge')).toBeNull();
  });

  it('asks a guest for name and first message, then opens the created thread', () => {
    mount();
    (el().querySelector('.chat-float') as HTMLButtonElement).click();
    fixture.detectChanges();

    fixture.componentInstance.guestName = 'Ada Obi';
    fixture.componentInstance.firstMessage = 'How much for 20 tees?';
    fixture.detectChanges();
    (el().querySelector('.chat-composer--start button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(api.startGuestThread).toHaveBeenCalledWith('Ada Obi', 'How much for 20 tees?');
    expect(JSON.parse(localStorage.getItem('seentair.chat.guest')!)).toEqual({
      id: 'conv-1',
      token: 'guest-token',
    });
    const messages = [...el().querySelectorAll('.chat-msg')];
    expect(messages.length).toBe(2);
    expect(messages[1].classList.contains('out')).toBe(true);
  });

  it('validates the guest form without calling the API', () => {
    mount();
    (el().querySelector('.chat-float') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el().querySelector('.chat-composer--start button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el().textContent).toContain('Tell us your name first.');
    expect(api.startGuestThread).not.toHaveBeenCalled();
  });

  it('resumes a remembered guest thread directly', () => {
    localStorage.setItem(
      'seentair.chat.guest',
      JSON.stringify({ id: 'conv-1', token: 'guest-token' }),
    );
    mount();
    (el().querySelector('.chat-float') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(api.threadDetail).toHaveBeenCalledWith('conv-1', 'guest-token');
    expect(api.markThreadRead).toHaveBeenCalledWith('conv-1', 'guest-token');
    expect(el().querySelectorAll('.chat-msg').length).toBe(2);
  });

  it('drops a stale guest identity when the thread is gone', () => {
    localStorage.setItem(
      'seentair.chat.guest',
      JSON.stringify({ id: 'conv-1', token: 'guest-token' }),
    );
    mount();
    api.threadDetail.and.returnValue(throwError(() => ({ error: { message: 'not found' } })));
    (el().querySelector('.chat-float') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(localStorage.getItem('seentair.chat.guest')).toBeNull();
  });

  it('lists the signed-in customer threads and unread counts', () => {
    TestBed.resetTestingModule();
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'myThreads',
      'threadDetail',
      'sendMessage',
      'markThreadRead',
    ]);
    api.myThreads.and.returnValue(
      of([
        {
          id: 'conv-1',
          subject: 'Size question',
          status: 'open',
          lastMessagePreview: 'Yes, we ship nationwide.',
          lastMessageAt: '2026-11-16T10:05:00.000Z',
          unreadCustomer: 1,
          createdAt: '2026-11-16T09:00:00.000Z',
        },
      ]),
    );
    api.threadDetail.and.returnValue(of(detail({ unreadCustomer: 1 })));
    api.markThreadRead.and.returnValue(of({ ok: true }));
    TestBed.configureTestingModule({
      imports: [ChatWidgetComponent],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    const service = TestBed.inject(ChatService);
    Object.defineProperty(service.api, 'isLoggedIn', { get: () => true });
    fixture = TestBed.createComponent(ChatWidgetComponent);
    fixture.detectChanges();

    (el().querySelector('.chat-float') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el().querySelector('.chat-float__badge')?.textContent?.trim()).toBeUndefined();
    expect(el().textContent).toContain('Size question');
    // Closing the panel brings the launcher badge back with the unread count.
    (el().querySelector('.chat-close') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el().querySelector('.chat-float__badge')?.textContent?.trim()).toBe('1');
  });

  it('sends a signed-in reply and reloads the thread', () => {
    TestBed.resetTestingModule();
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'myThreads',
      'threadDetail',
      'sendMessage',
      'markThreadRead',
    ]);
    api.myThreads.and.returnValue(of([]));
    api.threadDetail.and.returnValue(of(detail({ unreadCustomer: 0 })));
    api.sendMessage.and.returnValue(of({}));
    TestBed.configureTestingModule({
      imports: [ChatWidgetComponent],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    const service = TestBed.inject(ChatService);
    Object.defineProperty(service.api, 'isLoggedIn', { get: () => true });
    fixture = TestBed.createComponent(ChatWidgetComponent);
    fixture.detectChanges();

    service.openThread('conv-1');
    fixture.detectChanges();

    fixture.componentInstance.draft = 'Is the hoodie available in XL?';
    fixture.detectChanges();
    (el().querySelector('.chat-composer button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(api.sendMessage).toHaveBeenCalledWith(
      'conv-1',
      'Is the hoodie available in XL?',
      undefined,
    );
    expect(api.threadDetail).toHaveBeenCalledTimes(2);
  });
});
