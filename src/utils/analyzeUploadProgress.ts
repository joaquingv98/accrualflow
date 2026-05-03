/**
 * POST multipart con XMLHttpRequest para subida con bytes cargados vs total,
 * y fase servidor asintótica (aprox. 97% hasta respuesta JSON).
 */

const UPLOAD_SHARE = 0.46;

function clampPct(n: number): number {
  return Math.min(97, Math.max(0, n));
}

/** Avance que se aplana al acercarse al tope cap (rápido al inicio, lento al final). */
export function asymptoticTowardCap(elapsedMs: number, cap: number, tauMs: number): number {
  if (elapsedMs <= 0 || cap <= 0) return 0;
  return cap * (1 - Math.exp(-elapsedMs / tauMs));
}

export function estimateAnalyzePayloadBytes(parts: {
  zip: File | null | undefined;
  openAccruals?: File | null | undefined;
  provision?: File | null | undefined;
  closingMonthLen?: number;
}): number {
  let sum =
    (parts.zip?.size ?? 0) + (parts.openAccruals?.size ?? 0) + (parts.provision?.size ?? 0);
  sum += Math.max(512, (parts.closingMonthLen ?? 0) * 2);
  sum += 16_384;
  return Math.max(sum, 64 * 1024);
}

/**
 * Combina porcentaje 0–97: primera parte proporcional al upload real; el resto asintótico hasta el servidor.
 */
export function combinedAnalyzePercent(opts: {
  uploadComplete: boolean;
  uploadFrac0to1: number;
  millisSinceProcessingStart: number;
  millisSinceSubmit: number;
}): number {
  const uploadFrac = Math.min(1, Math.max(0, opts.uploadFrac0to1));

  if (!opts.uploadComplete) {
    let u = UPLOAD_SHARE * 100 * uploadFrac;
    /* Si el servidor tarda en emitir primer event.progress, muestra algo de movimiento muy suave */
    if (opts.millisSinceSubmit > 280 && uploadFrac < 0.015) {
      u += asymptoticTowardCap(opts.millisSinceSubmit - 280, 2.5, 1_400);
    }
    const rounded = Math.round(Math.min(u, UPLOAD_SHARE * 99) * 10) / 10;
    return clampPct(rounded);
  }

  const base = UPLOAD_SHARE * 100;
  const remain = (1 - UPLOAD_SHARE) * 100;
  const body = asymptoticTowardCap(opts.millisSinceProcessingStart, remain * 0.92, 7_400);
  return clampPct(Math.round((base + body) * 10) / 10);
}

export type MultipartUploadResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

/** POST multipart; onPercent solo sube hasta 97; el llamador marca 100 al terminar. */
export function xhrPostMultipartAnalyze<T>(
  url: string,
  formData: FormData,
  estimatedTotalBytes: number,
  onPercent: (p: number) => void,
): Promise<MultipartUploadResult<T>> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let totalEst = Math.max(estimatedTotalBytes, 1024);

    let uploadLoaded = 0;
    let uploadComplete = false;
    let submitStartedMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let processingStartedMs: number | null = null;

    let raf: number | null = null;
    let lastRounded = -1;

    function frame() {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const millisSinceSubmit = Math.max(0, now - submitStartedMs);

      let uploadFrac: number;
      if (uploadComplete) uploadFrac = 1;
      else if (uploadLoaded <= 0) uploadFrac = 0;
      else uploadFrac = uploadLoaded / Math.max(totalEst, uploadLoaded);

      const procMs =
        processingStartedMs != null ? Math.max(0, now - processingStartedMs) : 0;

      const pct = combinedAnalyzePercent({
        uploadComplete,
        uploadFrac0to1: uploadFrac,
        millisSinceProcessingStart: procMs,
        millisSinceSubmit,
      });

      const floored = Math.floor(pct);
      if (floored !== lastRounded) {
        lastRounded = floored;
        onPercent(floored);
      }
      raf = requestAnimationFrame(frame);
    }

    xhr.upload.addEventListener('progress', (ev) => {
      uploadLoaded = ev.loaded;
      if (ev.lengthComputable && ev.total > 0) {
        totalEst = Math.max(totalEst, ev.total);
      }
    });

    xhr.upload.addEventListener('load', () => {
      uploadComplete = true;
      processingStartedMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    });

    xhr.addEventListener('load', () => {
      if (raf != null) {
        cancelAnimationFrame(raf);
        raf = null;
      }

      const text = xhr.responseText ?? '';
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve({ ok: true, status: xhr.status, data: JSON.parse(text) as T });
        } catch {
          resolve({ ok: false, status: xhr.status, error: 'Respuesta no JSON válida' });
        }
      } else {
        try {
          const j = JSON.parse(text) as { error?: string };
          resolve({
            ok: false,
            status: xhr.status,
            error: j.error ?? xhr.statusText ?? `HTTP ${xhr.status}`,
          });
        } catch {
          const trimmed = text?.trim() ?? '';
          const looksLikeHtml = /^<!DOCTYPE/i.test(trimmed) || /^<html/i.test(trimmed);
          const hint =
            xhr.status === 404 && looksLikeHtml
              ? ' (404 HTML: ¿falta VITE_API_URL en el build de Netlify o la API no está desplegada?)'
              : '';
          resolve({
            ok: false,
            status: xhr.status,
            error:
              (looksLikeHtml ? `HTTP ${xhr.status}: respuesta HTML (no la API).${hint}` : trimmed.slice(0, 280)) ||
              xhr.statusText ||
              `HTTP ${xhr.status}`,
          });
        }
      }
    });

    xhr.addEventListener('error', () => {
      if (raf != null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      resolve({ ok: false, status: 0, error: 'Error de red' });
    });

    xhr.addEventListener('abort', () => {
      if (raf != null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      resolve({ ok: false, status: 0, error: 'Cancelado' });
    });

    submitStartedMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    raf = requestAnimationFrame(frame);
    xhr.open('POST', url);
    xhr.send(formData);
  });
}
