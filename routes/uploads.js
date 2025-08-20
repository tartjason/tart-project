const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const { putBuffer, getUploadsKey, getPublicUrl } = require('../utils/s3');

// Debug middleware to log all requests
router.use((req, res, next) => {
  console.log(`[UPLOADS] ${req.method} ${req.path} - ${req.originalUrl}`);
  next();
});

// --- Multer Setup for File Uploads (memory storage; upload to S3) ---
const storage = multer.memoryStorage();

function checkFileType(file, cb) {
  // Allowed ext
  const filetypes = /jpeg|jpg|png|gif|webp/;
  // Check ext
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  // Check mime
  const mimetype = filetypes.test(file.mimetype || '');
  if (mimetype && extname) return cb(null, true);
  cb('Error: Images Only!');
}

const upload = multer({
  storage: storage,
  limits: { fileSize: 10000000 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  }
}).single('image'); // field name expected from the client

// Custom middleware to handle multer upload and errors
const uploadMiddleware = (req, res, next) => {
  upload(req, res, function (err) {
    if (err) {
      console.error('--- MULTER ERROR (uploads) ---');
      console.error(err);
      console.error('--- END MULTER ERROR ---');
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ msg: err.message });
      } else {
        return res.status(400).json({ msg: err.message || 'An unknown upload error occurred' });
      }
    }
    next();
  });
};

// @route   POST /api/uploads/site-image
// @desc    Upload a site image (home/about backgrounds) to S3 and return public URL
// @access  Private
router.post('/site-image', [auth, uploadMiddleware], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: 'Please upload an image file' });
    }

    const Bucket = process.env.S3_BUCKET;
    if (!Bucket) {
      return res.status(500).json({ msg: 'S3 is not configured' });
    }

    const folder = 'site-images';
    const Key = getUploadsKey(req.artist.id, req.file.originalname, folder);
    await putBuffer({ Bucket, Key, Body: req.file.buffer, ContentType: req.file.mimetype });
    const url = getPublicUrl(Bucket, Key);

    return res.json({ url, key: Key });
  } catch (err) {
    console.error('Site image upload error:', err);
    return res.status(500).json({ msg: 'Server error during upload' });
  }
});

module.exports = router;
