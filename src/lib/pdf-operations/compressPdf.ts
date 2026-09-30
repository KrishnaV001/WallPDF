// src/lib/pdf-operations/compressPdf.ts
//
// This is a faithful extraction of the image-recompression logic that used
// to live inline in ToolWorkspace's handleProcess for 'compress-pdf'. The
// color-space resolution and image-candidate scanning are unchanged; the
// only differences are (a) progress is reported via an optional callback
// instead of setProgress, and (b) the "what happened" note is returned
// instead of set via setCompressionNote, so callers (single-file UI, batch,
// or a workflow step) can each decide how to surface it.
import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';
import type { CompressOptions, CompressResult, ProgressCallback } from './types';

// Resolves a PDF /ColorSpace entry down to a simple kind + component count.
// Handles the common /ICCBased case (an indirect reference to a stream whose
// /N entry says how many components it has) - most real-world camera/scanner
// JPEGs use ICCBased (embedded sRGB/Gray profile) rather than plain
// /DeviceRGB, so this matters a lot.
function resolveColorSpace(csObj: any): { kind: 'gray' | 'rgb' | 'cmyk' | 'other'; components: number | null } {
  if (csObj instanceof PDFName) {
    const n = csObj.asString();
    if (n === '/DeviceGray' || n === '/CalGray') return { kind: 'gray', components: 1 };
    if (n === '/DeviceRGB' || n === '/CalRGB' || n === '/Lab') return { kind: 'rgb', components: 3 };
    if (n === '/DeviceCMYK') return { kind: 'cmyk', components: 4 };
    return { kind: 'other', components: null };
  }
  try {
    const arr = csObj as { lookup: (i: number, t?: any) => any; size: () => number };
    if (arr && typeof arr.lookup === 'function' && arr.size() > 0) {
      const head = arr.lookup(0, PDFName);
      const headStr = head instanceof PDFName ? head.asString() : null;
      if (headStr === '/ICCBased') {
        const streamObj = arr.lookup(1);
        const nEntry = streamObj?.dict?.get?.(PDFName.of('N'));
        const n = nEntry instanceof PDFNumber ? nEntry.asNumber() : null;
        if (n === 1) return { kind: 'gray', components: 1 };
        if (n === 3) return { kind: 'rgb', components: 3 };
        if (n === 4) return { kind: 'cmyk', components: 4 };
        return { kind: 'other', components: null };
      }
      if (headStr === '/CalRGB') return { kind: 'rgb', components: 3 };
      if (headStr === '/CalGray') return { kind: 'gray', components: 1 };
      return { kind: 'other', components: null }; // Indexed, Separation, DeviceN, etc.
    }
  } catch {
    // fall through
  }
  return { kind: 'other', components: null };
}

type ImageCandidate = {
  ref: any;
  dict: PDFDict;
  kind: 'jpeg' | 'raster';
  originalSize: number; // bytes this image currently occupies in the file
  getImageData: () => Promise<{ width: number; height: number; blob: Blob }>;
};

export async function compressPdf(
  bytes: Uint8Array,
  options: CompressOptions,
  onProgress?: ProgressCallback
): Promise<CompressResult> {
  onProgress?.(10);
  const pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false });

  onProgress?.(20);

  const indirectObjects = pdfDoc.context.enumerateIndirectObjects();
  const imageCandidates: ImageCandidate[] = [];
  let totalImageObjects = 0;
  let skippedUnsupported = 0;
  const skipReasons: Record<string, number> = {}; // e.g. "filter:/CCITTFaxDecode" -> count

  const recordSkip = (reason: string) => {
    skippedUnsupported++;
    skipReasons[reason] = (skipReasons[reason] || 0) + 1;
  };

  for (const [ref, object] of indirectObjects) {
    if (!(object instanceof PDFRawStream)) continue;
    const dict = object.dict;

    const subtype = dict.get(PDFName.of('Subtype'));
    if (!(subtype instanceof PDFName) || subtype.asString() !== '/Image') continue;
    totalImageObjects++;

    const bpc = dict.get(PDFName.of('BitsPerComponent'));
    if (bpc instanceof PDFNumber && bpc.asNumber() !== 8) { recordSkip('bit-depth'); continue; }

    const filter = dict.get(PDFName.of('Filter'));
    const filterName = filter instanceof PDFName ? filter.asString() : null;
    const colorSpaceRaw = dict.get(PDFName.of('ColorSpace'));
    const colorInfo = resolveColorSpace(colorSpaceRaw);

    // Skip images with an alpha channel - flattening to JPEG would lose transparency.
    if (dict.has(PDFName.of('SMask')) || dict.has(PDFName.of('Mask'))) { recordSkip('transparency'); continue; }
    if (dict.has(PDFName.of('Decode'))) { recordSkip('custom-decode-array'); continue; } // non-standard value mapping

    if (filterName === '/DCTDecode') {
      // The browser's own JPEG decoder reads color info straight out of the
      // JPEG bytes (JFIF/Adobe markers), independent of what the PDF's
      // /ColorSpace dict entry says - so we only need to rule out CMYK JPEGs
      // here (Adobe's inverted-CMYK JPEGs render wrong via canvas).
      // Everything else - DeviceRGB, DeviceGray, and the very common
      // ICCBased (embedded sRGB/Gray profile) - is safe to try.
      if (colorInfo.kind === 'cmyk') { recordSkip('cmyk-jpeg'); continue; }

      // Raw contents of a /DCTDecode stream ARE the JPEG bytes already.
      const jpegBytes = object.getContents();
      imageCandidates.push({
        ref,
        dict,
        kind: 'jpeg',
        originalSize: object.getContentsSize(),
        getImageData: async () => {
          const buf = jpegBytes.buffer.slice(jpegBytes.byteOffset, jpegBytes.byteOffset + jpegBytes.byteLength) as ArrayBuffer;
          const blob = new Blob([buf], { type: 'image/jpeg' });
          const bitmap = await createImageBitmap(blob);
          return { width: bitmap.width, height: bitmap.height, blob };
        },
      });
    } else if (filterName === '/FlateDecode' || filterName === null) {
      // We're reconstructing raw pixels by hand here, so unlike the JPEG
      // case above we DO need to know the exact component layout - only
      // proceed for plain/ICCBased gray or RGB.
      if (colorInfo.kind !== 'gray' && colorInfo.kind !== 'rgb') { recordSkip(`raster-colorspace:${colorInfo.kind}`); continue; }
      const comps = colorInfo.components as 1 | 3;

      // Likely a raw (uncompressed-pixel) bitmap, Flate-compressed for
      // storage. Common for images pasted via Word/Google Docs exports.
      const width = dict.get(PDFName.of('Width'));
      const height = dict.get(PDFName.of('Height'));
      if (!(width instanceof PDFNumber) || !(height instanceof PDFNumber)) { recordSkip('missing-dimensions'); continue; }
      const w = width.asNumber();
      const h = height.asNumber();

      imageCandidates.push({
        ref,
        dict,
        kind: 'raster',
        originalSize: object.getContentsSize(),
        getImageData: async () => {
          const decoded = decodePDFRawStream(object).decode();
          const expectedLength = w * h * comps;
          if (decoded.length < expectedLength) {
            throw new Error(`unexpected raw image data size (got ${decoded.length}, expected ${expectedLength})`);
          }
          const rgba = new Uint8ClampedArray(w * h * 4);
          for (let p = 0; p < w * h; p++) {
            if (comps === 3) {
              rgba[p * 4] = decoded[p * 3];
              rgba[p * 4 + 1] = decoded[p * 3 + 1];
              rgba[p * 4 + 2] = decoded[p * 3 + 2];
            } else {
              const gray = decoded[p];
              rgba[p * 4] = gray;
              rgba[p * 4 + 1] = gray;
              rgba[p * 4 + 2] = gray;
            }
            rgba[p * 4 + 3] = 255;
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('no 2d context');
          ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
          const blob: Blob = await new Promise((resolve, reject) => {
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), 'image/png');
          });
          return { width: w, height: h, blob };
        },
      });
    } else {
      recordSkip(`filter:${filterName ?? 'unknown'}`); // e.g. CCITTFaxDecode, JBIG2Decode, JPXDecode - scanned docs, not handled yet
    }
  }

  console.info(
    `[compress-pdf] ${totalImageObjects} image object(s) found, ${imageCandidates.length} eligible for recompression, ${skippedUnsupported} skipped.`,
    skipReasons
  );

  onProgress?.(30);

  const targetBytes = options.targetSizeKb && !isNaN(options.targetSizeKb) ? options.targetSizeKb * 1024 : null;

  let compressedBytes: Uint8Array | null = null;
  let anyImageShrunk = false;

  // Recompresses every candidate image at the given JPEG quality (always
  // starting from the original pixel data, never compounding across calls)
  // and returns the resulting saved PDF bytes.
  const applyQualityPass = async (quality: number): Promise<Uint8Array> => {
    for (let i = 0; i < imageCandidates.length; i++) {
      const candidate = imageCandidates[i];
      try {
        const { width, height, blob: sourceBlob } = await candidate.getImageData();
        const bitmap = await createImageBitmap(sourceBlob);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { bitmap.close(); continue; }
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();

        const recompressedBlob: Blob = await new Promise((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))),
            'image/jpeg',
            quality
          );
        });
        const newBytes = new Uint8Array(await recompressedBlob.arrayBuffer());

        // Only swap it in if we actually made it smaller.
        if (newBytes.length < candidate.originalSize) {
          const newDict = candidate.dict.clone(pdfDoc.context);
          newDict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
          newDict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
          newDict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
          newDict.set(PDFName.of('Length'), PDFNumber.of(newBytes.length));
          newDict.delete(PDFName.of('DecodeParms'));
          pdfDoc.context.assign(candidate.ref, PDFRawStream.of(newDict, newBytes));
          anyImageShrunk = true;
        }
      } catch (imgErr) {
        console.warn('[compress-pdf] skipped an image that failed to recompress', imgErr);
      }

      onProgress?.(30 + Math.round(((i + 1) / Math.max(imageCandidates.length, 1)) * 50));
    }

    return pdfDoc.save({ useObjectStreams: true });
  };

  if (!targetBytes) {
    compressedBytes = await applyQualityPass(0.6);
  } else {
    // Binary-search the JPEG quality so the result lands close to the
    // requested target size, instead of jumping through a few fixed quality
    // steps and stopping at the first one that happens to be under the
    // target (which tends to overshoot and compress more than necessary).
    let low = 0.1;
    let high = 0.85;
    let bestUnderTarget: Uint8Array | null = null;
    let smallestSeen: Uint8Array | null = null;
    const maxIterations = 6;
    const closeEnoughRatio = 0.97; // stop once within 3% of the target

    for (let iter = 0; iter < maxIterations; iter++) {
      const quality = (low + high) / 2;
      const result = await applyQualityPass(quality);

      if (!smallestSeen || result.length < smallestSeen.length) {
        smallestSeen = result;
      }

      if (result.length <= targetBytes) {
        bestUnderTarget = result;
        if (result.length >= targetBytes * closeEnoughRatio) break;
        low = quality; // under target with room to spare - try higher quality
      } else {
        high = quality; // still too big - compress harder
      }
    }

    compressedBytes = bestUnderTarget ?? smallestSeen;
  }

  onProgress?.(90);

  if (!compressedBytes) {
    compressedBytes = await pdfDoc.save({ useObjectStreams: true });
  }

  let note: string | null = null;
  if (imageCandidates.length === 0) {
    if (totalImageObjects === 0) {
      note = "This PDF doesn't contain any embedded raster images, so there's very little left to compress - it's likely already close to its minimum size.";
    } else {
      const topReason = Object.entries(skipReasons).sort((a, b) => b[1] - a[1])[0];
      const scanFormats = ['filter:/CCITTFaxDecode', 'filter:/JBIG2Decode', 'filter:/JPXDecode'];
      const looksLikeScan = topReason && scanFormats.includes(topReason[0]);
      note = looksLikeScan
        ? `Found ${totalImageObjects} image(s), but they're stored in a scanned-document format (${topReason![0].replace('filter:', '')}) that this tool doesn't recompress yet - that's why the size didn't change.`
        : `Found ${totalImageObjects} image(s), but none were in a format we can safely recompress right now (reasons: ${Object.entries(skipReasons).map(([k, v]) => `${k}=${v}`).join(', ')}).`;
    }
  } else if (!anyImageShrunk) {
    note = 'The images in this PDF were already efficiently compressed, so we kept the originals rather than making them larger.';
  }

  onProgress?.(100);
  return { bytes: compressedBytes, note };
}
