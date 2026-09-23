import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, provideZonelessChangeDetection, signal } from '@angular/core';
import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { FormField, disabled, form } from '@angular/forms/signals';
import { Subject } from 'rxjs';

import type { Image } from '../../api/generated/models/image';

import { ImageUpload } from './image-upload';
import { MediaUploader } from './media-uploader';
import type { UploadProgress } from './media-uploader';
import { UploadTracker } from './upload-tracker';

interface HostModel {
  readonly image: Image | null;
  readonly locked: boolean;
}

/** Records every `upload()` call and hands back a `Subject` the test drives by hand. */
class MediaUploaderStub {
  readonly calls: Blob[] = [];
  readonly subjects: Subject<UploadProgress>[] = [];

  upload(file: Blob): Subject<UploadProgress> {
    this.calls.push(file);
    const subject = new Subject<UploadProgress>();
    this.subjects.push(subject);
    return subject;
  }
}

@Component({
  selector: 'adm-image-upload-test-host',
  imports: [ImageUpload, FormField],
  template: `<adm-image-upload [formField]="form.image" />`,
})
class ImageUploadTestHost {
  readonly model = signal<HostModel>({ image: null, locked: false });
  readonly form = form(this.model, (path) => {
    disabled(path.image, { when: (ctx) => ctx.valueOf(path.locked) });
  });
}

@Component({
  selector: 'adm-image-upload-tracked-test-host',
  imports: [ImageUpload, FormField],
  providers: [UploadTracker],
  template: `<adm-image-upload [formField]="form.image" />`,
})
class ImageUploadTrackedTestHost {
  readonly tracker = inject(UploadTracker);
  readonly model = signal<HostModel>({ image: null, locked: false });
  readonly form = form(this.model, (path) => {
    disabled(path.image, { when: (ctx) => ctx.valueOf(path.locked) });
  });
}

function pngFile(size = 10, name = 'a.png'): File {
  return new File([new Uint8Array(size)], name, { type: 'image/png' });
}

function hostElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('expected the host element');
  }
  return raw;
}

function fileInput(fixture: ComponentFixture<unknown>): HTMLInputElement {
  const found = hostElement(fixture).querySelector('input[type="file"]');
  if (!(found instanceof HTMLInputElement)) {
    throw new Error('missing file input');
  }
  return found;
}

function chooseButton(fixture: ComponentFixture<unknown>): HTMLButtonElement {
  const found = hostElement(fixture).querySelector('button');
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error('missing choose button');
  }
  return found;
}

function dropzone(fixture: ComponentFixture<unknown>): HTMLElement {
  const found = hostElement(fixture).querySelector('.adm-image-upload-dropzone');
  if (!(found instanceof HTMLElement)) {
    throw new Error('missing dropzone');
  }
  return found;
}

function preview(fixture: ComponentFixture<unknown>): HTMLImageElement | null {
  const found = hostElement(fixture).querySelector('img');
  return found instanceof HTMLImageElement ? found : null;
}

function progressBar(fixture: ComponentFixture<unknown>): Element | null {
  return hostElement(fixture).querySelector('mat-progress-bar');
}

function alertText(fixture: ComponentFixture<unknown>): string {
  const found = hostElement(fixture).querySelector('p[role="alert"]');
  if (!(found instanceof HTMLParagraphElement)) {
    throw new Error('missing alert paragraph');
  }
  return found.textContent.trim();
}

function chooseFile(fixture: ComponentFixture<unknown>, file: File): void {
  const input = fileInput(fixture);
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change'));
}

function dropFile(fixture: ComponentFixture<unknown>, file: File): void {
  const event = new Event('drop', { cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { configurable: true, value: { files: [file] } });
  dropzone(fixture).dispatchEvent(event);
}

function problemError(
  status: number,
  fieldErrors: readonly { path: string; code: string }[] = [],
): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: { code: 'VALIDATION_FAILED', status, fieldErrors },
  });
}

describe('ImageUpload', () => {
  let uploaderStub: MediaUploaderStub;
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;
  let blobCounter: number;

  beforeEach(() => {
    uploaderStub = new MediaUploaderStub();
    blobCounter = 0;
    createObjectURLMock = vi.fn(() => `blob:mock-${String(blobCounter++)}`);
    revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURLMock,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  async function createFixture<T>(hostType: Type<T>): Promise<ComponentFixture<T>> {
    TestBed.configureTestingModule({
      imports: [hostType],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MediaUploader, useValue: uploaderStub },
      ],
    });
    const fixture = TestBed.createComponent(hostType);
    await fixture.whenStable();
    return fixture;
  }

  it('1. uploads a chosen png once, and a done event sets the field value', async () => {
    // Fails if handleFile stops calling MediaUploader.upload exactly once, or
    // if the done branch stops building the Image from the UploadedImage.
    const fixture = await createFixture(ImageUploadTestHost);
    const file = pngFile();

    chooseFile(fixture, file);
    await fixture.whenStable();

    expect(uploaderStub.calls).toEqual([file]);
    const subject = uploaderStub.subjects[0];
    subject.next({
      kind: 'done',
      image: {
        id: 'img-1',
        src: '/api/v1/media/img-1',
        contentType: 'image/png',
        width: 10,
        height: 20,
        sizeBytes: 10,
      },
    });
    subject.complete();
    await fixture.whenStable();

    expect(fixture.componentInstance.form.image().value()).toEqual({
      id: 'img-1',
      src: '/api/v1/media/img-1',
      width: 10,
      height: 20,
      alt: '',
    });
  });

  it('2. rejects a text file as UNSUPPORTED_IMAGE_TYPE without calling upload', async () => {
    // Fails if the type check stops reading SERVER_FIELD_MESSAGES.UNSUPPORTED_IMAGE_TYPE.
    const fixture = await createFixture(ImageUploadTestHost);
    const file = new File(['hello'], 'a.txt', { type: 'text/plain' });

    chooseFile(fixture, file);
    await fixture.whenStable();

    expect(alertText(fixture)).toBe('Csak PNG, JPEG vagy WebP kép tölthető fel.');
    expect(uploaderStub.calls).toEqual([]);
  });

  it('3. rejects a png over 1 048 576 bytes without calling upload', async () => {
    // Fails if the size check stops comparing against 1_048_576.
    const fixture = await createFixture(ImageUploadTestHost);
    const file = pngFile(1_048_577);

    chooseFile(fixture, file);
    await fixture.whenStable();

    expect(alertText(fixture)).toBe('A kép legfeljebb 1 MB lehet.');
    expect(uploaderStub.calls).toEqual([]);
  });

  it('4. a progress event of 40 shows aria-valuenow 40 on the progress bar', async () => {
    // Fails if the progress branch stops setting `percent`, or the template drops
    // `mode="determinate"` in favour of the indeterminate default.
    const fixture = await createFixture(ImageUploadTestHost);
    chooseFile(fixture, pngFile());
    await fixture.whenStable();

    const subject = uploaderStub.subjects[0];
    subject.next({ kind: 'progress', percent: 40 });
    await fixture.whenStable();

    expect(progressBar(fixture)?.getAttribute('aria-valuenow')).toBe('40');
  });

  it('5. shows the blob URL while uploading and the server src after done, revoking the blob URL', async () => {
    // Fails if previewSrc stops preferring the live blob URL, or finishUpload
    // stops revoking it once the server has answered.
    const fixture = await createFixture(ImageUploadTestHost);
    chooseFile(fixture, pngFile());
    await fixture.whenStable();

    expect(preview(fixture)?.getAttribute('src')).toBe('blob:mock-0');

    const subject = uploaderStub.subjects[0];
    subject.next({
      kind: 'done',
      image: {
        id: 'img-1',
        src: '/api/v1/media/img-1',
        contentType: 'image/png',
        width: 1,
        height: 1,
        sizeBytes: 1,
      },
    });
    subject.complete();
    await fixture.whenStable();

    expect(preview(fixture)?.getAttribute('src')).toBe('/api/v1/media/img-1');
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-0');
  });

  it('6. choosing a second file revokes the first blob URL and cancels the first upload', async () => {
    // Fails if handleFile stops unsubscribing the previous upload before starting a new one.
    const fixture = await createFixture(ImageUploadTestHost);
    chooseFile(fixture, pngFile(10, 'first.png'));
    await fixture.whenStable();
    const firstSubject = uploaderStub.subjects[0];

    chooseFile(fixture, pngFile(10, 'second.png'));
    await fixture.whenStable();

    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-0');
    expect(firstSubject.observed).toBe(false);
    expect(uploaderStub.calls).toHaveLength(2);
  });

  it('7. revokes a live blob URL when the host is destroyed', async () => {
    // Fails if the DestroyRef.onDestroy hook stops revoking the live blob URL.
    const fixture = await createFixture(ImageUploadTestHost);
    chooseFile(fixture, pngFile());
    await fixture.whenStable();

    fixture.destroy();

    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-0');
  });

  it('8. maps upload errors to their Hungarian text and leaves the value unchanged', async () => {
    // Fails if uploadErrorMessage stops branching on 413 / 422 / anything else,
    // or if a failed upload still changes `value`.
    const fixture = await createFixture(ImageUploadTestHost);

    chooseFile(fixture, pngFile());
    await fixture.whenStable();
    uploaderStub.subjects[0].error(problemError(413));
    await fixture.whenStable();
    expect(alertText(fixture)).toBe('A kép legfeljebb 1 MB lehet.');
    expect(fixture.componentInstance.form.image().value()).toBeNull();

    chooseFile(fixture, pngFile());
    await fixture.whenStable();
    uploaderStub.subjects[1].error(
      problemError(422, [{ path: '/file', code: 'IMAGE_UNREADABLE' }]),
    );
    await fixture.whenStable();
    expect(alertText(fixture)).toBe('A kép nem olvasható.');
    expect(fixture.componentInstance.form.image().value()).toBeNull();

    chooseFile(fixture, pngFile());
    await fixture.whenStable();
    uploaderStub.subjects[2].error(problemError(500));
    await fixture.whenStable();
    expect(alertText(fixture)).toBe('A feltöltés nem sikerült. Próbáld újra.');
    expect(fixture.componentInstance.form.image().value()).toBeNull();
  });

  it('9. blurring the button marks the field touched', async () => {
    // Fails if the button stops emitting `touch` on blur.
    const fixture = await createFixture(ImageUploadTestHost);

    expect(fixture.componentInstance.form.image().touched()).toBe(false);

    chooseButton(fixture).dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(fixture.componentInstance.form.image().touched()).toBe(true);
  });

  it('10. a drop event carrying a png starts the upload', async () => {
    // Fails if onDrop stops reading the first file off event.dataTransfer.files.
    const fixture = await createFixture(ImageUploadTestHost);
    const file = pngFile();

    dropFile(fixture, file);
    await fixture.whenStable();

    expect(uploaderStub.calls).toEqual([file]);
  });

  it('11. a disabled field disables the button and ignores a drop', async () => {
    // Fails if the button stops binding [disabled]="disabled()", or onDrop stops
    // checking disabled() before reading the dropped file.
    const fixture = await createFixture(ImageUploadTestHost);
    fixture.componentInstance.model.update((current) => ({ ...current, locked: true }));
    await fixture.whenStable();

    expect(chooseButton(fixture).disabled).toBe(true);

    dropFile(fixture, pngFile());
    await fixture.whenStable();

    expect(uploaderStub.calls).toEqual([]);
    expect(fixture.componentInstance.form.image().value()).toBeNull();
  });

  it('12. a provided UploadTracker is busy during an upload and idle after done', async () => {
    // Fails if handleFile stops routing the upload through `tracker?.track(...)`.
    const fixture = await createFixture(ImageUploadTrackedTestHost);
    const tracker = fixture.componentInstance.tracker;
    expect(tracker.busy()).toBe(false);

    chooseFile(fixture, pngFile());
    await fixture.whenStable();
    expect(tracker.busy()).toBe(true);

    const subject = uploaderStub.subjects[0];
    subject.next({
      kind: 'done',
      image: {
        id: 'img-1',
        src: '/api/v1/media/img-1',
        contentType: 'image/png',
        width: 1,
        height: 1,
        sizeBytes: 1,
      },
    });
    subject.complete();
    await fixture.whenStable();

    expect(tracker.busy()).toBe(false);
  });
});
