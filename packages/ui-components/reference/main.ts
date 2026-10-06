import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { ReferenceApp } from './reference.app';

bootstrapApplication(ReferenceApp, { providers: [provideRouter([])] }).catch((err) =>
  console.error(err),
);
