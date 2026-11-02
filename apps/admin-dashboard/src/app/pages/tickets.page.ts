import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SeButtonDirective,
  SeColumn,
  SeDatePipe,
  SeDrawerComponent,
  SeFieldComponent,
  SeInputDirective,
  SePageComponent,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService, HelpTicket } from '../api.service';

@Component({
  selector: 'app-help-tickets',
  imports: [
    FormsModule,
    SeButtonDirective,
    SeDatePipe,
    SeDrawerComponent,
    SeFieldComponent,
    SeInputDirective,
    SePageComponent,
    SeTableComponent,
  ],
  template: `
    <se-page title="Help tickets">
      @if (canWrite()) {
        <button seButton variant="primary" sePageActions type="button" (click)="openCreate()">
          Create ticket
        </button>
      }
      <se-table
        caption="Help tickets"
        [columns]="columns"
        [rows]="tickets()"
        [loading]="loading()"
        [error]="error()"
        (retry)="load()"
        [pageSize]="25"
        emptyHeading="No help tickets"
        emptyText="Staff-created tickets for internal follow-up will appear here."
      >
        <ng-template seCell="subject" let-row>
          <button seButton type="button" (click)="viewTicket(row)">{{ row.subject }}</button>
        </ng-template>
        <ng-template seCell="createdAt" let-row>{{ row.createdAt | seDate: 'datetime' }}</ng-template>
        <ng-template seCell="actions" let-row>
          @if (canWrite() && row.status !== 'resolved') {
            <button seButton type="button" (click)="setStatus(row, 'in_progress')">
              In progress
            </button>
            <button seButton type="button" (click)="setStatus(row, 'resolved')">Resolve</button>
          }
        </ng-template>
      </se-table>

      @if (canWrite()) {
        <se-drawer title="Create help ticket" [(open)]="creating">
          <form class="se-form" (ngSubmit)="create()">
            <se-field label="Subject" [error]="formError()">
              <input seInput name="subject" [(ngModel)]="subject" maxlength="180" />
            </se-field>
            <se-field label="Description">
              <textarea
                seInput
                name="description"
                rows="5"
                [(ngModel)]="description"
                maxlength="10000"
              ></textarea>
            </se-field>
            @if (formError()) {
              <p role="alert">{{ formError() }}</p>
            }
          </form>
          <ng-container seDrawerFooter>
            <button seButton type="button" (click)="creating.set(false)">Cancel</button>
            <button seButton variant="primary" [loading]="saving()" (click)="create()">
              Save ticket
            </button>
          </ng-container>
        </se-drawer>
      }

      <se-drawer [title]="selectedTicket()?.subject ?? 'Ticket details'" [(open)]="viewingTicket">
        @if (selectedTicket(); as ticket) {
          <p><strong>Status:</strong> {{ ticket.status }}</p>
          <p><strong>Created:</strong> {{ ticket.createdAt | seDate: 'datetime' }}</p>
          <p style="white-space: pre-wrap">{{ ticket.description }}</p>
        }
      </se-drawer>
    </se-page>
  `,
})
export class HelpTicketsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly access = inject(AccessService);
  private readonly toast = inject(SeToastService);
  readonly canWrite = computed(() => this.access.can('communication', 'full'));
  readonly tickets = signal<HelpTicket[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly creating = signal(false);
  readonly selectedTicket = signal<HelpTicket | null>(null);
  viewingTicket = false;
  subject = '';
  description = '';

  readonly columns: SeColumn<HelpTicket>[] = [
    { key: 'subject', header: 'Subject', value: (ticket) => ticket.subject },
    { key: 'status', header: 'Status', sortable: true, value: (ticket) => ticket.status },
    { key: 'createdAt', header: 'Created', sortable: true, value: (ticket) => ticket.createdAt },
    { key: 'actions', header: 'Actions', value: () => '' },
  ];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.helpTickets().subscribe({
      next: (result) => {
        this.tickets.set(result.data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Help tickets could not be loaded.');
        this.loading.set(false);
      },
    });
  }

  openCreate(): void {
    this.subject = '';
    this.description = '';
    this.formError.set('');
    this.creating.set(true);
  }

  viewTicket(ticket: HelpTicket): void {
    this.selectedTicket.set(ticket);
    this.viewingTicket = true;
  }

  create(): void {
    const subject = this.subject.trim();
    const description = this.description.trim();
    if (subject.length < 3 || description.length < 5) {
      this.formError.set('Enter a subject (at least 3 characters) and description (at least 5).');
      return;
    }
    this.formError.set('');
    this.saving.set(true);
    this.api.createHelpTicket({ subject, description }).subscribe({
      next: () => {
        this.saving.set(false);
        this.creating.set(false);
        this.toast.show('Help ticket created');
        this.load();
      },
      error: (error) => {
        this.saving.set(false);
        this.formError.set(error?.error?.message ?? 'The ticket could not be created.');
      },
    });
  }

  setStatus(ticket: HelpTicket, status: HelpTicket['status']): void {
    this.api.updateHelpTicketStatus(ticket.id, status).subscribe({
      next: () => {
        this.toast.show(`Ticket ${status === 'resolved' ? 'resolved' : 'moved to in progress'}`);
        this.load();
      },
      error: (error) =>
        this.toast.show(error?.error?.message ?? 'Ticket status could not be updated.', {
          tone: 'danger',
        }),
    });
  }
}
