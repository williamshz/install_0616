import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadApp } from './harness.mjs';

describe('harness', () => {
  let app;
  beforeAll(() => { app = loadApp(); });
  afterAll(() => app.dispose());

  it('exposes the inline script functions on window', () => {
    expect(typeof app.window.generateCheckScript).toBe('function');
    expect(app.get('state').installMethod).toBe('yum');
  });
});
