import { Subject } from 'rxjs';

import { UploadTracker } from './upload-tracker';

describe('UploadTracker', () => {
  it('active() is 0 and busy() is false before anything is tracked', () => {
    const tracker = new UploadTracker();

    expect(tracker.active()).toBe(0);
    expect(tracker.busy()).toBe(false);
  });

  it('active() is 1 and busy() is true while one tracked Subject is subscribed', () => {
    const tracker = new UploadTracker();
    const source = new Subject<number>();

    tracker.track(source).subscribe();

    expect(tracker.active()).toBe(1);
    expect(tracker.busy()).toBe(true);
  });

  it('active() is 2 while two tracked Subjects are subscribed', () => {
    const tracker = new UploadTracker();
    const first = new Subject<number>();
    const second = new Subject<number>();

    tracker.track(first).subscribe();
    tracker.track(second).subscribe();

    expect(tracker.active()).toBe(2);
    expect(tracker.busy()).toBe(true);
  });

  it('active() returns to 0 and busy() to false when a tracked source completes', () => {
    const tracker = new UploadTracker();
    const source = new Subject<number>();

    tracker.track(source).subscribe();
    source.complete();

    expect(tracker.active()).toBe(0);
    expect(tracker.busy()).toBe(false);
  });

  it('active() returns to 0 when a tracked source errors', () => {
    const tracker = new UploadTracker();
    const source = new Subject<number>();

    tracker.track(source).subscribe({ error: () => undefined });
    source.error(new Error('boom'));

    expect(tracker.active()).toBe(0);
    expect(tracker.busy()).toBe(false);
  });

  it('active() returns to 0 when the subscription is unsubscribed', () => {
    const tracker = new UploadTracker();
    const source = new Subject<number>();

    const subscription = tracker.track(source).subscribe();
    subscription.unsubscribe();

    expect(tracker.active()).toBe(0);
    expect(tracker.busy()).toBe(false);
  });
});
