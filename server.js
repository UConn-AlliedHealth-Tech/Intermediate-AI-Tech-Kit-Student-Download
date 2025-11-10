const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 3001;

// Serve static frontend files from medical-ai-frontend folder
app.use(express.static(path.join(__dirname, 'medical-ai-frontend')));

// Route unmatched paths to index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'medical-ai-frontend', 'index.html'));
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/images', express.static(path.join(__dirname, 'downloaded_images')));

// Configure multer for file upload
const upload = multer({ dest: 'uploads/' });

// In-memory storage for session data
const sessions = new Map();

// Utility function to find image files recursively
async function findImageFilesInDir(dir, limit = 50) {
  const images = [];
  
  async function searchDir(currentDir, depth = 0) {
    if (images.length >= limit || depth > 5) return;
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (images.length >= limit) break;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await searchDir(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.jpg', '.jpeg', '.png', '.bmp'].includes(ext) && !entry.name.includes('_mask')) {
            const relativePath = path.relative(path.join(__dirname, 'downloaded_images'), fullPath).replace(/\\/g, '/');
            images.push({
              filename: entry.name,
              path: `/images/${relativePath}`,
              fullPath: fullPath
            });
          }
        }
      }
    } catch (err) {
      console.error(`Error reading directory ${currentDir}:`, err);
    }
  }
  
  await searchDir(dir);
  return images;
}

// API Endpoints

// Get available datasets
app.get('/api/datasets', async (req, res) => {
  try {
    const downloadDir = path.join(__dirname, 'downloaded_images');
    const busuDir = path.join(downloadDir, 'Dataset_BUSI_with_GT');
    let busuAvailable = false;
    try {
      await fs.access(busuDir);
      busuAvailable = true;
    } catch {
      busuAvailable = false;
    }
    const chestDir = path.join(downloadDir, 'chest_xray');
    let chestAvailable = false;
    try {
      await fs.access(chestDir);
      chestAvailable = true;
    } catch {
      chestAvailable = false;
    }
    res.json({
      success: true,
      datasets: {
        breast_ultrasound: {
          kaggle_id: "aryashah2k/breast-ultrasound-images-dataset",
          name: "Breast Ultrasound Images",
          description: "Classify breast ultrasounds as Benign, Malignant, or Normal",
          classes: ["Normal", "Benign", "Malignant"],
          available: busuAvailable,
          localPath: busuAvailable ? busuDir : null
        },
        chest_xray: {
          kaggle_id: "paultimothymooney/chest-xray-pneumonia",
          name: "Chest X-Ray Pneumonia Detection",
          description: "Classify chest X-rays as Normal or Pneumonia",
          classes: ["Normal", "Pneumonia"],
          available: chestAvailable,
          localPath: chestAvailable ? chestDir : null
        }
      }
    });
  } catch (error) {
    console.error('Error getting datasets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fetch dataset samples from local files
app.post('/api/fetch-dataset-samples', async (req, res) => {
  try {
    const { datasetKey, classes, numSamples = 8 } = req.body;
    if (!datasetKey) {
      return res.status(400).json({ success: false, error: 'Dataset key required' });
    }
    let baseDir;
    if (datasetKey === 'breast_ultrasound') {
      baseDir = path.join(__dirname, 'downloaded_images', 'Dataset_BUSI_with_GT');
    } else if (datasetKey === 'chest_xray') {
      baseDir = path.join(__dirname, 'downloaded_images', 'chest_xray', 'train');
    } else {
      return res.status(400).json({ success: false, error: 'Unknown dataset' });
    }
    try {
      await fs.access(baseDir);
    } catch {
      return res.status(404).json({
        success: false,
        error: `Dataset not found. Please ensure ${datasetKey === 'breast_ultrasound' ? 'Dataset_BUSI_with_GT' : 'chest_xray'} folder exists in downloaded_images.`
      });
    }
    const organized = {};
    if (classes && classes.length > 0) {
      for (const className of classes) {
        let classDir;
        if (datasetKey === 'breast_ultrasound') {
          classDir = path.join(baseDir, className.toLowerCase());
        } else if (datasetKey === 'chest_xray') {
          classDir = path.join(baseDir, className.toUpperCase());
        }
        try {
          await fs.access(classDir);
          const images = await findImageFilesInDir(classDir, numSamples);
          organized[className] = images;
        } catch {
          organized[className] = [];
        }
      }
    }
    let totalImages = [];
    for (const className of classes || []) {
      if (organized[className]) {
        totalImages = totalImages.concat(organized[className]);
      }
    }
    res.json({
      success: true,
      images: totalImages.slice(0, numSamples),
      organizedImages: organized,
      count: totalImages.length
    });
  } catch (error) {
    console.error('Fetch samples error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fetch a single test image
app.post('/api/fetch-test-image', async (req, res) => {
  try {
    const { datasetKey, className } = req.body;
    const baseDir = (datasetKey === 'chest_xray')
      ? path.join(__dirname, 'downloaded_images', 'chest_xray', 'test')
      : path.join(__dirname, 'downloaded_images', 'Dataset_BUSI_with_GT');
    let searchPath = baseDir;
    if (className) {
      if (datasetKey === 'chest_xray') {
        searchPath = path.join(baseDir, className.toUpperCase());
      } else {
        searchPath = path.join(baseDir, className.toLowerCase());
      }
    }
    let images = await findImageFilesInDir(searchPath, 50);
    if (images.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No images found for the specified class.'
      });
    }
    const randomImage = images[Math.floor(Math.random() * images.length)];
    res.json({ success: true, image: randomImage });
  } catch (error) {
    console.error('Fetch test image error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get images by class
app.get('/api/images/:className', async (req, res) => {
  try {
    const { className } = req.params;
    const { limit = 50, dataset } = req.query;
    if (!dataset) {
      return res.status(400).json({ success: false, error: 'Dataset not specified' });
    }
    let baseDir;
    if (dataset === 'breast_ultrasound') {
      baseDir = path.join(__dirname, 'downloaded_images', 'Dataset_BUSI_with_GT');
    } else if (dataset === 'chest_xray') {
      baseDir = path.join(__dirname, 'downloaded_images', 'chest_xray', 'train');
    } else {
      return res.status(400).json({ success: false, error: 'Unknown dataset' });
    }
    let classDir;
    if (dataset === 'breast_ultrasound') {
      classDir = path.join(baseDir, className.toLowerCase());
    } else {
      classDir = path.join(baseDir, className.toUpperCase());
    }
    try {
      await fs.access(classDir);
    } catch {
      return res.json({ success: true, images: [] });
    }
    const images = await findImageFilesInDir(classDir, parseInt(limit));
    res.json({ success: true, images: images });
  } catch (error) {
    console.error('Get images error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`Images will be served from: http://localhost:${PORT}/images/`);
  console.log(`Dataset directory: ${path.join(__dirname, 'downloaded_images')}`);
});
