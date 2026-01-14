const express = require('express');
const router = express.Router();
const db = require('../config/database');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for logo upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/logos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Get settings (public - no auth required for logo on login pages)
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM settings LIMIT 1');
    if (result.rows.length === 0) {
      // Return default settings if none exist
      return res.json({
        id: 1,
        convention_name: 'My Convention',
        logo_url: null
      });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update settings
router.put('/', auth, async (req, res) => {
  try {
    const { convention_name } = req.body;
    
    // Check if settings exist
    const checkResult = await db.query('SELECT * FROM settings LIMIT 1');
    
    if (checkResult.rows.length === 0) {
      // Insert new settings
      const result = await db.query(
        'INSERT INTO settings (convention_name, updated_at) VALUES ($1, NOW()) RETURNING *',
        [convention_name]
      );
      res.json(result.rows[0]);
    } else {
      // Update existing settings
      const result = await db.query(
        'UPDATE settings SET convention_name = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [convention_name, checkResult.rows[0].id]
      );
      res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Upload logo
router.post('/logo', auth, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const logoUrl = `/uploads/logos/${req.file.filename}`;
    
    // Check if settings exist
    const checkResult = await db.query('SELECT * FROM settings LIMIT 1');
    
    if (checkResult.rows.length === 0) {
      // Insert new settings with logo
      const result = await db.query(
        'INSERT INTO settings (convention_name, logo_url, updated_at) VALUES ($1, $2, NOW()) RETURNING *',
        ['My Convention', logoUrl]
      );
      res.json(result.rows[0]);
    } else {
      // Delete old logo if exists
      if (checkResult.rows[0].logo_url) {
        const oldLogoPath = path.join(__dirname, '../..', checkResult.rows[0].logo_url);
        if (fs.existsSync(oldLogoPath)) {
          fs.unlinkSync(oldLogoPath);
        }
      }
      
      // Update with new logo
      const result = await db.query(
        'UPDATE settings SET logo_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [logoUrl, checkResult.rows[0].id]
      );
      res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error uploading logo:', error);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

// Delete logo
router.delete('/logo', auth, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM settings LIMIT 1');
    
    if (result.rows.length > 0 && result.rows[0].logo_url) {
      // Delete file
      const logoPath = path.join(__dirname, '../..', result.rows[0].logo_url);
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
      
      // Update database
      await db.query(
        'UPDATE settings SET logo_url = NULL, updated_at = NOW() WHERE id = $1',
        [result.rows[0].id]
      );
    }
    
    res.json({ message: 'Logo deleted successfully' });
  } catch (error) {
    console.error('Error deleting logo:', error);
    res.status(500).json({ error: 'Failed to delete logo' });
  }
});

module.exports = router;
