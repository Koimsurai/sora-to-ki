// EXIF 抽取 + RAM++ 標籤呼叫。抽到獨立模組，降低對 index.js 的改動面。
const exifr = require('exifr');
const axios = require('axios');

const PHOTO_TAGGER_URL = process.env.PHOTO_TAGGER_URL || 'http://photo-tagger:8000';
const TAGGER_TIMEOUT_MS = Number(process.env.PHOTO_TAGGER_TIMEOUT_MS || 25000);

// 抽 EXIF，映射成前端 ImageLightbox 期望的形狀（make/model 小寫，其餘照 EXIF tag 名）。
async function extractExif(sourcePath) {
  try {
    const raw = await exifr.parse(sourcePath, {
      pick: ['Make', 'Model', 'LensModel', 'FNumber', 'ISO', 'ExposureTime',
             'FocalLength', 'FocalLengthIn35mmFormat', 'DateTimeOriginal'],
    });
    if (!raw) return null;
    const exif = {
      make: raw.Make,
      model: raw.Model,
      LensModel: raw.LensModel,
      FNumber: raw.FNumber,
      ISO: raw.ISO,
      ExposureTime: raw.ExposureTime,
      FocalLength: raw.FocalLength,
      FocalLengthIn35mmFormat: raw.FocalLengthIn35mmFormat,
      DateTimeOriginal: raw.DateTimeOriginal instanceof Date
        ? raw.DateTimeOriginal.toISOString()
        : raw.DateTimeOriginal,
    };
    for (const k of Object.keys(exif)) {
      if (exif[k] === undefined || exif[k] === null) delete exif[k];
    }
    return Object.keys(exif).length ? exif : null;
  } catch (err) {
    console.error('[photoTagger] extractExif failed:', sourcePath, '-', err.message);
    return null;
  }
}

// 呼叫 RAM++ 服務，回 { tags: 繁中[], tagsEn: 英文[] }。失敗回 null（不擋 sync）。
async function tagPhoto(taggerImagePath) {
  try {
    const { data } = await axios.post(
      `${PHOTO_TAGGER_URL}/tag`,
      { path: taggerImagePath },
      { timeout: TAGGER_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } },
    );
    return {
      tags: Array.isArray(data && data.zh_tw) ? data.zh_tw : [],
      tagsEn: Array.isArray(data && data.en) ? data.en : [],
    };
  } catch (err) {
    console.error('[photoTagger] tagPhoto failed:', taggerImagePath, '-', err.message);
    return null;
  }
}

module.exports = { extractExif, tagPhoto, PHOTO_TAGGER_URL };
