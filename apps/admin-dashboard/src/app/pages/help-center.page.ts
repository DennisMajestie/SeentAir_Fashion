import { Component, OnInit, inject, signal } from '@angular/core';
import { SeCardComponent, SePageComponent } from '@seentair/ui';
import { HelpArticle, ApiService } from '../api.service';

@Component({
  selector: 'app-help-center',
  imports: [SeCardComponent, SePageComponent],
  template: `
    <se-page title="Help Center">
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      } @else if (loading()) {
        <p>Loading help articles…</p>
      } @else {
        @for (article of articles(); track article.id) {
          <se-card [title]="article.title">
            <p>{{ article.summary }}</p>
            @for (paragraph of article.content; track $index) {
              <p>{{ paragraph }}</p>
            }
            <small>Source: {{ article.source }}</small>
          </se-card>
        }
      }
    </se-page>
  `,
})
export class HelpCenterPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly articles = signal<HelpArticle[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  ngOnInit(): void {
    this.api.helpArticles().subscribe({
      next: (articles) => {
        this.articles.set(articles);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Help articles could not be loaded.');
        this.loading.set(false);
      },
    });
  }
}
