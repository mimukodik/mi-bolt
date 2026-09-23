import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { ElementRef } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatProgressBar } from '@angular/material/progress-bar';
import type { Subscription } from 'rxjs';

import type { Image } from '../../api/generated/models/image';
import { fieldErrorsOf } from '../../core/api/problem';
import { SERVER_FIELD_FALLBACK, SERVER_FIELD_MESSAGES } from '../forms/messages';

import { MediaUploader } from './media-uploader';
import type { UploadProgress } from './media-uploader';
import { UploadTracker } from './upload-tracker';

/** `spring.servlet.multipart.max-file-size` default, 1 MB (ADR 0021:27, mirrored at media.handlers.ts:34). */
const MAX_UPLOAD_BYTES = 1_048_576;

const ALLOWED_TYPES: ReadonlySet<string> = new Set(['image/webp', 'image/jpeg', 'image/png']);

const IMAGE_TOO_LARGE_MESSAGE = 'A kép legfeljebb 1 MB lehet.';
const UPLOAD_FAILED_MESSAGE = 'A feltöltés nem sikerült. Próbáld újra.';

/** The error text for a failed upload: 413, 422 with a field error, or anything else. */
function uploadErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse && error.status === 413) {
    return IMAGE_TOO_LARGE_MESSAGE;
  }
  if (error instanceof HttpErrorResponse && error.status === 422) {
    const errors = fieldErrorsOf(error);
    if (errors.length === 0) {
      return UPLOAD_FAILED_MESSAGE;
    }
    return SERVER_FIELD_MESSAGES[errors[0].code] ?? SERVER_FIELD_FALLBACK;
  }
  return UPLOAD_FAILED_MESSAGE;
}

/**
 * The admin's image-upload control (MIM-354). Checks the file's type and the
 * 1 MB limit before any request, uploads through `MediaUploader`, previews
 * the chosen file from a blob URL until the server answers, and shows its
 * own upload error — the field's `required` error is `adm-control-error`'s
 * (F23). An optional `UploadTracker` in the host's `providers` is told about
 * every upload, so a page holding this control can hold its save button
 * disabled while one is running.
 */
@Component({
  selector: 'adm-image-upload',
  imports: [MatButton, MatProgressBar],
  templateUrl: './image-upload.html',
  styles: `
    :host {
      display: block;
    }

    .adm-image-upload-file-input {
      display: none;
    }

    .adm-image-upload-dropzone {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .adm-image-upload-preview {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 120px;
      height: 120px;
      border: 1px dashed var(--mat-sys-outline);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
      text-align: center;
    }

    .adm-image-upload-hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class ImageUpload implements FormValueControl<Image | null> {
  private readonly mediaUploader = inject(MediaUploader);
  private readonly tracker = inject(UploadTracker, { optional: true });

  readonly value = model<Image | null>(null);
  readonly disabled = input<boolean>(false);
  readonly touched = input<boolean>(false);
  readonly touch = output();

  /** Bound to the button's `[attr.aria-describedby]`; F23 passes `adm-control-error`'s id. */
  readonly describedBy = input<string | null>(null);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly chooseButton = viewChild.required<ElementRef<HTMLButtonElement>>('chooseButton');

  protected readonly previewUrl = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly percent = signal(0);
  protected readonly error = signal<string | null>(null);

  /** The blob URL while an upload runs, otherwise the current value's `src`, or `null`. */
  protected readonly previewSrc = computed(() => this.previewUrl() ?? this.value()?.src ?? null);

  private subscription: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.subscription?.unsubscribe();
      this.revokePreviewUrl();
    });
  }

  focus(options?: FocusOptions): void {
    this.chooseButton().nativeElement.focus(options);
  }

  protected openFilePicker(): void {
    this.fileInput().nativeElement.click();
  }

  protected onFileInputChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const file = target.files?.[0] ?? null;
    target.value = '';
    if (file !== null) {
      this.handleFile(file);
    }
  }

  protected onDragOver(event: DragEvent): void {
    if (this.disabled()) {
      return;
    }
    event.preventDefault();
  }

  protected onDrop(event: DragEvent): void {
    if (this.disabled()) {
      return;
    }
    event.preventDefault();
    const file = event.dataTransfer?.files[0] ?? null;
    if (file !== null) {
      this.handleFile(file);
    }
  }

  protected onBlur(): void {
    this.touch.emit();
  }

  private handleFile(file: File): void {
    this.touch.emit();
    this.error.set(null);

    if (!ALLOWED_TYPES.has(file.type)) {
      this.error.set(SERVER_FIELD_MESSAGES['UNSUPPORTED_IMAGE_TYPE'] ?? SERVER_FIELD_FALLBACK);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      this.error.set(IMAGE_TOO_LARGE_MESSAGE);
      return;
    }

    this.subscription?.unsubscribe();
    this.revokePreviewUrl();
    this.previewUrl.set(URL.createObjectURL(file));
    this.uploading.set(true);
    this.percent.set(0);

    const upload$ = this.mediaUploader.upload(file);
    this.subscription = (this.tracker?.track(upload$) ?? upload$).subscribe({
      next: (progress) => {
        this.onUploadProgress(progress);
      },
      error: (error: unknown) => {
        this.onUploadError(error);
      },
    });
  }

  private onUploadProgress(progress: UploadProgress): void {
    if (progress.kind === 'progress') {
      this.percent.set(progress.percent);
      return;
    }
    const alt = this.value()?.alt ?? '';
    this.finishUpload();
    this.value.set({
      id: progress.image.id,
      src: progress.image.src,
      width: progress.image.width,
      height: progress.image.height,
      alt,
    });
  }

  private onUploadError(error: unknown): void {
    this.finishUpload();
    this.error.set(uploadErrorMessage(error));
  }

  private finishUpload(): void {
    this.revokePreviewUrl();
    this.uploading.set(false);
    this.subscription = null;
  }

  private revokePreviewUrl(): void {
    const url = this.previewUrl();
    if (url !== null) {
      URL.revokeObjectURL(url);
    }
    this.previewUrl.set(null);
  }
}
