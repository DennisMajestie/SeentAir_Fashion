import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { ReferenceApp } from './reference.app';

// Zoneless, like the apps that consume the components: anything that only
// worked because zone.js noticed it would be a bug there.
bootstrapApplication(ReferenceApp, {
  providers: [provideZonelessChangeDetection(), provideRouter([])],
}).catch((err) => console.error(err));
