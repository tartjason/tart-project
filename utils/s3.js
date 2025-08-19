const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

// Create S3 client using env credentials and region
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const s3 = new S3Client({ region: REGION });

function getSitesKey(artistId) {
  const prefix = process.env.S3_SITES_PREFIX || 'sites';
  return `${prefix}/${String(artistId)}/site.json`;
}

function getUploadsKey(artistId, filename, folder = '') {
  const prefix = process.env.S3_UPLOADS_PREFIX || 'uploads';
  const safeName = String(filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const stamped = `${Date.now()}-${safeName}`;
  const base = `${prefix}/${String(artistId)}`;
  return folder ? `${base}/${folder}/${stamped}` : `${base}/${stamped}`;
}

function getPublicUrl(Bucket, Key) {
  const region = REGION;
  return `https://${Bucket}.s3.${region}.amazonaws.com/${encodeURI(Key)}`;
}

async function putJson({ Bucket, Key, Body, ContentType = 'application/json' }) {
  if (!Bucket) throw new Error('S3 Bucket is required');
  if (!Key) throw new Error('S3 Key is required');
  const cmd = new PutObjectCommand({ Bucket, Key, Body, ContentType, CacheControl: 'no-cache' });
  return s3.send(cmd);
}

async function putBuffer({ Bucket, Key, Body, ContentType }) {
  if (!Bucket) throw new Error('S3 Bucket is required');
  if (!Key) throw new Error('S3 Key is required');
  const cmd = new PutObjectCommand({ Bucket, Key, Body, ContentType, CacheControl: 'public, max-age=31536000, immutable' });
  return s3.send(cmd);
}

async function getObjectStream({ Bucket, Key }) {
  const cmd = new GetObjectCommand({ Bucket, Key });
  const res = await s3.send(cmd);
  return { stream: res.Body, contentType: res.ContentType };
}

async function deleteObject({ Bucket, Key }) {
  const cmd = new DeleteObjectCommand({ Bucket, Key });
  return s3.send(cmd);
}

module.exports = {
  s3,
  getSitesKey,
  getUploadsKey,
  getPublicUrl,
  putJson,
  putBuffer,
  getObjectStream,
  deleteObject,
};
