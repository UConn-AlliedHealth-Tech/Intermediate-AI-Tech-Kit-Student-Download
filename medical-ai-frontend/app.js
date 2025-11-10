// =========================
// Backend API Configuration
// =========================
const API_BASE_URL = 'http://localhost:3001';

// =========================
// Application State
// =========================
const appState = {
  kaggleConnected: false,
  kaggleStatus: 'Ready to use local dataset',
  kaggleJson: null,
  selectedDataset: null, // 'breast_ultrasound' | 'chest_xray'
  datasetLoaded: false,
  datasetSampleImages: {
    chest_xray: [],
    breast_ultrasound: []
  },
  // training/eval/test state
  training: {
    inProgress: false,
    history: { epoch: [], train: [], val: [] },
    chart: null,
    finalTrainAcc: null,
    finalValAcc: null
  },
  evaluation: {
    accuracy: null,
    precision: null,
    recall: null,
    specificity: null,
    yourModelAcc: null,
    rocChart: null
  },
  test: {
    currentImage: null, // { filename, path }
    originalPrediction: null,
    modifiedPrediction: null
  },
  perturbations: {
    noise: 0,
    brightness: 100,
    blur: 0
  }
};

// =========================
// Dataset Configuration
// =========================
const datasets = {
  breast_ultrasound: {
    key: 'breast_ultrasound',
    name: 'Breast Ultrasound',
    description: 'Classify tumors as Benign or Malignant (BUSI)',
    classes: ['benign', 'malignant', 'normal'],
    available: false,
    localPath: 'downloaded_images/Dataset_BUSI_with_GT',
    previewContainerId: 'breastUltrasoundPreview',
    cardSelectBtnId: 'selectBreastUltrasound',
    benchAcc: 0.92,
    trainCount: 546
  },
  chest_xray: {
    key: 'chest_xray',
    name: 'Chest X-ray Pneumonia Detection',
    description: 'Classify chest X-rays as Normal or Pneumonia',
    classes: ['NORMAL', 'PNEUMONIA'],
    available: false,
    localPath: null, // not bundled locally
    previewContainerId: 'chestXrayPreview',
    cardSelectBtnId: 'selectChestXray',
    benchAcc: 0.95,
    trainCount: 5216
  }
};

// =========================
// Utilities
// =========================
function updateEffectiveExamples() {
  const effectiveEl = $('effectiveExamples');
  const dataSlider = $('dataAmountSlider');
  const augCheck = $('augmentationCheck');
  if (!effectiveEl || !dataSlider || !augCheck) return;
  const key = appState.selectedDataset || 'breast_ultrasound';
  const baseCount = (datasets[key] && datasets[key].trainCount) ? datasets[key].trainCount : 0;
  const percent = Number(dataSlider.value) / 100;
  let effectiveCount = Math.round(baseCount * percent);
  if (augCheck.checked) {
    effectiveCount *= 2;
  }
  effectiveEl.textContent = effectiveCount;
}

function $(id) {
  return document.getElementById(id);
}

function ensureUploadStatusElement() {
  // Some HTML versions may not include this. Create if missing to show messages.
  if (!$('uploadStatus')) {
    const status = document.createElement('div');
    status.id = 'uploadStatus';
    status.className = 'upload-status';
    status.style.display = 'none';
    // Insert just after the first fileUploadArea
    const areas = document.querySelectorAll('#fileUploadArea');
    if (areas && areas.length > 0) {
      const parent = areas[0].parentElement || areas[0];
      parent.appendChild(status);
    } else {
      document.body.appendChild(status);
    }
  }
}

function showStatus(msg, type = 'success') {
  ensureUploadStatusElement();
  const el = $('uploadStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = `upload-status ${type}`;
  el.style.display = 'block';
}

function hideStatus() {
  const el = $('uploadStatus');
  if (el) el.style.display = 'none';
}

function switchTab(tabIdStr) {
  const tabId = String(tabIdStr);
  const tabs = document.querySelectorAll('.tab-content');
  const btns = document.querySelectorAll('.tab-btn');
  tabs.forEach(t => t.style.display = 'none');
  btns.forEach(b => b.classList.remove('active'));

  const content = $(`tab${tabId}`);
  if (content) content.style.display = 'block';
  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (btn) btn.classList.add('active');
  const currentTabEl = $('currentTab');
  if (currentTabEl) currentTabEl.textContent = tabId;
}

function enableTabButton(idx) {
  const btn = $(`tabBtn${idx}`);
  if (btn) btn.disabled = false;
}

// =========================
// Backend helpers
// =========================
async function apiGet(path) {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

async function apiPost(path, data) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {})
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
  return res.json();
}

// =========================
// Initialization
// =========================
async function initializeDatasets() {
  try {
    const result = await apiGet('/api/datasets');
    if (result.success && result.datasets) {
      // Expecting structure:
      // { breast_ultrasound: { available: true/false, name, ... }, chest_xray: {...} }
      Object.entries(result.datasets).forEach(([key, info]) => {
        if (datasets[key]) {
          datasets[key].available = !!info.available;
        }
      });
    }
  } catch (err) {
    console.error('Failed to initialize datasets:', err);
  }
}

async function attemptToShowSampleImages() {
  // Populate each dataset card with up to 4 images if available locally
  for (const key of Object.keys(datasets)) {
    const ds = datasets[key];
    const container = $(ds.previewContainerId);
    if (!container) continue;

    if (!ds.available) {
      // Update placeholder message if Kaggle connected but dataset missing
      const placeholder = container.querySelector('.preview-placeholder');
      if (placeholder) {
        placeholder.textContent = (key === 'breast_ultrasound')
          ? 'Local sample images not found.'
          : 'Dataset requires Kaggle download';
      }
      continue;
    }

    try {
      const result = await apiPost('/api/fetch-dataset-samples', {
        datasetKey: key,
        classes: ds.classes,
        numSamples: 4
      });
      container.innerHTML = '';
      const images = (result && result.success && result.images) ? result.images.slice(0, 4) : [];
      datasets[key].sampleImages = images;
      if (images.length === 0) {
        container.innerHTML = '<div class="preview-placeholder">No images found</div>';
      } else {
        images.forEach(img => {
          const imgEl = document.createElement('img');
          imgEl.src = `${API_BASE_URL}${img.path}`;
          imgEl.alt = img.filename || 'sample';
          imgEl.style.width = '24%';
          imgEl.style.margin = '1%';
          imgEl.style.objectFit = 'cover';
          imgEl.style.borderRadius = '8px';
          imgEl.onerror = () => (imgEl.style.display = 'none');
          container.appendChild(imgEl);
        });
      }
    } catch (error) {
      console.error(`Unable to fetch samples for ${key}:`, error);
    }
  }
}

// =========================
// Kaggle Upload
// =========================
function wireKaggleUpload() {
  // There are duplicate elements with id=fileUploadArea in the HTML;
  // wire both so either works.
  const uploadAreas = document.querySelectorAll('#fileUploadArea');
  const fileInput = $('kaggleFileInput');

  const openPicker = () => fileInput && fileInput.click();

  uploadAreas.forEach(area => {
    if (!area) return;
    area.addEventListener('click', openPicker);
    area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('dragover'); });
    area.addEventListener('dragleave', () => area.classList.remove('dragover'));
    area.addEventListener('drop', (e) => {
      e.preventDefault();
      area.classList.remove('dragover');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleKaggleFile(file);
    });
  });

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleKaggleFile(file);
    });
  }

  // help accordion if present
  const helpBtn = $('showKaggleHelp');
  const helpContent = $('kaggleHelpContent');
  if (helpBtn && helpContent) {
    helpBtn.addEventListener('click', () => {
      helpContent.style.display = (helpContent.style.display === 'block') ? 'none' : 'block';
    });
  }
}

function handleKaggleFile(file) {
  ensureUploadStatusElement();
  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const content = e.target.result;
      const parsed = JSON.parse(content);
      if (!parsed.username || !parsed.key) {
        showStatus('Invalid kaggle.json (missing username or key).', 'error');
        return;
      }
      // Mark as connected (we are not calling Kaggle CLI here)
      appState.kaggleConnected = true;
      appState.kaggleJson = parsed;
      showStatus(`Kaggle connected as ${parsed.username}.`, 'success');

      // Initialize dataset availability & load previews
      await initializeDatasets();
      await attemptToShowSampleImages();
    } catch (err) {
      console.error('Error reading kaggle.json:', err);
      showStatus('Error reading kaggle.json.', 'error');
    }
  };
  reader.onerror = () => showStatus('Error reading file.', 'error');
  reader.readAsText(file);
}

// =========================
// Dataset Selection (Tab 0)
// =========================
function wireDatasetCards() {
  const bxBtn = $(datasets.chest_xray.cardSelectBtnId);
  const buBtn = $(datasets.breast_ultrasound.cardSelectBtnId);

  const onSelect = (key) => {
    appState.selectedDataset = key;
    // reveal "datasetSelectedSection"
    const ready = $('datasetSelectedSection');
    if (ready) ready.style.display = 'block';
    // also show a summary in Intro tab
    updateSelectedDatasetInfo();
  };

  if (bxBtn) bxBtn.addEventListener('click', () => onSelect('chest_xray'));
  if (buBtn) buBtn.addEventListener('click', () => onSelect('breast_ultrasound'));
}

function updateSelectedDatasetInfo() {
  const key = appState.selectedDataset;
  const target = $('selectedDatasetInfo');
  if (!key || !target) return;
  const ds = datasets[key];
  target.innerHTML = `
    <div class="dataset-summary">
      <h4>${ds.name}</h4>
      <p>${ds.description}</p>
      <div class="badge-row">
        <span class="badge">Classes: ${ds.classes.join(', ')}</span>
        <span class="badge">Benchmark ~${Math.round(ds.benchAcc * 100)}%</span>
        <span class="badge ${ds.available ? 'badge--ok' : 'badge--warn'}">
          ${ds.available ? 'Available locally' : 'Requires download'}
        </span>
      </div>
    </div>
  `;
}

// Proceed to Intro
function wireProceedToIntro() {
  const btn = $('proceedToIntro');
  if (!btn) return;
  btn.addEventListener('click', () => {
    enableTabButton(1);
    switchTab('1');
  });
}

// =========================
// Intro Tab (Tab 1)
// =========================
function wireIntroTab() {
  const previewBtn = $('previewBtn');
  const loadBtn = $('loadDatasetBtn');
  const loadedMsg = $('datasetLoadedMsg');

  if (previewBtn) {
    previewBtn.addEventListener('click', previewSamples);
  }
  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      appState.datasetLoaded = true;
      if (loadedMsg) loadedMsg.style.display = 'block';
      enableTabButton(2);
      enableTabButton(3);
      updateEffectiveExamples();
      alert('Dataset loaded successfully! You may proceed to Data Quality and Train Model.');
    });
  }
}

async function previewSamples() {
  const container = $('imageGrid');
  const preview = $('samplePreview');
  if (!container || !preview) return;

  container.innerHTML = `<p style="grid-column:1/-1;text-align:center;">Loading images...</p>`;
  preview.style.display = 'block';

  try {
    const key = appState.selectedDataset || 'breast_ultrasound';
    const ds = datasets[key];
    const result = await apiPost('/api/fetch-dataset-samples', {
      datasetKey: key,
      classes: ds.classes,
      numSamples: 8
    });
    const images = (result && result.success && result.images) ? result.images.slice(0, 8) : [];
    container.innerHTML = '';
    if (images.length === 0) {
      container.innerHTML = `<p style="color: var(--color-error);">No sample images available.</p>`;
    } else {
      images.forEach(img => {
        const el = document.createElement('img');
        el.src = `${API_BASE_URL}${img.path}`;
        el.alt = img.filename || 'sample';
        el.style.width = '23%';
        el.style.margin = '1%';
        el.style.objectFit = 'cover';
        el.style.borderRadius = '8px';
        el.onerror = () => (el.style.display = 'none');
        container.appendChild(el);
      });
    }
  } catch (err) {
    console.error('Preview samples failed:', err);
    container.innerHTML = `<p style="color: var(--color-error);">Failed to load images.</p>`;
  }
}

async function previewAugmentedSamples() {
  const grid = $('augmentationGrid');
  const previewSection = $('augmentationPreview');
  if (!grid || !previewSection) return;
  grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;">Generating augmented images...</p>`;
  previewSection.style.display = 'block';
  try {
    const key = appState.selectedDataset || 'breast_ultrasound';
    const ds = datasets[key];
    const result = await apiPost('/api/fetch-dataset-samples', {
      datasetKey: key,
      classes: ds.classes,
      numSamples: 4
    });
    const images = (result && result.success && result.images) ? result.images.slice(0, 4) : [];
    grid.innerHTML = '';
    if (images.length === 0) {
      grid.innerHTML = '<p style="color: var(--color-error);">No images available for augmentation.</p>';
      return;
    }
    images.forEach((img, idx) => {
      const imgUrl = img.path ? `${API_BASE_URL}${img.path}` : img.url;
      const baseImg = new Image();
      baseImg.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = baseImg.width;
        canvas.height = baseImg.height;
        const ctx = canvas.getContext('2d');
        if (idx % 4 === 0) {
          // Flip horizontally
          ctx.scale(-1, 1);
          ctx.drawImage(baseImg, -baseImg.width, 0);
        } else if (idx % 4 === 1) {
          // Rotate slightly
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(0.2);
          ctx.drawImage(baseImg, -baseImg.width / 2, -baseImg.height / 2);
        } else if (idx % 4 === 2) {
          // Decrease brightness
          ctx.filter = 'brightness(50%)';
          ctx.drawImage(baseImg, 0, 0);
        } else {
          // Apply blur
          ctx.filter = 'blur(2px)';
          ctx.drawImage(baseImg, 0, 0);
        }
        const augImg = new Image();
        augImg.src = canvas.toDataURL();
        augImg.style.width = '24%';
        augImg.style.margin = '1%';
        augImg.style.objectFit = 'cover';
        augImg.style.borderRadius = '8px';
        grid.appendChild(augImg);
      };
      baseImg.src = imgUrl;
    });
  } catch (err) {
    console.error('Augmentation preview error:', err);
    grid.innerHTML = '<p style="color: var(--color-error);">Failed to generate augmented samples.</p>';
  }
}

// =========================
// Data Quality Tab (Tab 2)
// =========================
function wireDataQualityTab() {
  const nS = $('noiseSlider'), nV = $('noiseValue');
  const bS = $('brightnessSlider'), bV = $('brightnessValue');
  const blS = $('blurSlider'), blV = $('blurValue');
  const dataSlider = $('dataAmountSlider'), dataValue = $('dataAmountValue');
  const augCheck = $('augmentationCheck');
  const qualitySlider = $('qualitySlider'), qualityValue = $('qualityValue');
  const previewAugBtn = $('previewAugmentBtn');

  if (nS && nV) {
    nS.addEventListener('input', () => {
      appState.perturbations.noise = Number(nS.value);
      nV.textContent = `${nS.value}%`;
    });
  }
  if (bS && bV) {
    bS.addEventListener('input', () => {
      appState.perturbations.brightness = Number(bS.value);
      bV.textContent = `${bS.value}%`;
    });
  }
  if (blS && blV) {
    blS.addEventListener('input', () => {
      appState.perturbations.blur = Number(blS.value);
      blV.textContent = `${blS.value}px`;
    });
  }
  if (dataSlider && dataValue) {
    dataSlider.addEventListener('input', () => {
      dataValue.textContent = dataSlider.value + '%';
      updateEffectiveExamples();
    });
  }
  if (augCheck) {
    augCheck.addEventListener('change', updateEffectiveExamples);
  }
  if (qualitySlider && qualityValue) {
    qualitySlider.addEventListener('input', () => {
      const qVal = Number(qualitySlider.value);
      qualityValue.textContent = qVal === 3 ? 'High' : (qVal === 2 ? 'Medium' : 'Low');
    });
  }
  if (previewAugBtn) {
    previewAugBtn.addEventListener('click', previewAugmentedSamples);
  }
}

// =========================
// Train Tab (Tab 3)
// =========================
function wireTrainTab() {
  const startBtn = $('startTrainingBtn');
  if (!startBtn) return;
  startBtn.addEventListener('click', startTraining);
}

function startTraining() {
  if (appState.training.inProgress) return;
  appState.training.inProgress = true;

  const progressEl = $('trainingProgress');
  const pb = $('progressBar');
  const status = $('trainingStatus');
  const trainAcc = $('trainAccuracy');
  const valAcc = $('valAccuracy');
  const chartCanvas = $('trainingChart');
  const done = $('trainingComplete');
  const finalTrain = $('finalTrainAcc');
  const finalVal = $('finalValAcc');

  if (progressEl) progressEl.style.display = 'block';
  if (done) done.style.display = 'none';

  // Simulate 12 epochs
  const EPOCHS = 12;
  appState.training.history = { epoch: [], train: [], val: [] };
  let step = 0;
  let prog = 0;

  // Chart.js line chart
  if (chartCanvas) {
    if (appState.training.chart) appState.training.chart.destroy();
    appState.training.chart = new Chart(chartCanvas, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'Train Accuracy', data: [] },
          { label: 'Val Accuracy', data: [] }
        ]
      },
      options: {
        responsive: true,
        animation: false,
        scales: { y: { min: 0, max: 1 } }
      }
    });
  }

  const interval = setInterval(() => {
    // progress bar
    prog = Math.min(100, prog + Math.random() * 12);
    if (pb) pb.style.width = `${prog}%`;
    if (status) status.textContent = `Training epoch ${Math.min(step + 1, EPOCHS)} of ${EPOCHS}...`;

    // each "tick" may finalize an epoch
    if (step < EPOCHS) {
      const epoch = step + 1;
      // Make accuracies increase with noise
      const tAcc = 0.6 + 0.35 * (epoch / EPOCHS) + (Math.random() * 0.03 - 0.015);
      const vAcc = 0.55 + 0.32 * (epoch / EPOCHS) + (Math.random() * 0.04 - 0.02);

      appState.training.history.epoch.push(epoch);
      appState.training.history.train.push(Math.min(0.99, Math.max(0.55, tAcc)));
      appState.training.history.val.push(Math.min(0.98, Math.max(0.5, vAcc)));

      if (trainAcc) trainAcc.textContent = `${Math.round(appState.training.history.train.at(-1) * 100)}%`;
      if (valAcc) valAcc.textContent = `${Math.round(appState.training.history.val.at(-1) * 100)}%`;

      if (appState.training.chart) {
        appState.training.chart.data.labels.push(`E${epoch}`);
        appState.training.chart.data.datasets[0].data.push(appState.training.history.train.at(-1));
        appState.training.chart.data.datasets[1].data.push(appState.training.history.val.at(-1));
        appState.training.chart.update('none');
      }
      step++;
    }

    if (prog >= 100 || step >= EPOCHS) {
      clearInterval(interval);
      appState.training.inProgress = false;
      const finalT = appState.training.history.train.at(-1) || 0.92;
      const finalV = appState.training.history.val.at(-1) || 0.89;
      appState.training.finalTrainAcc = finalT;
      appState.training.finalValAcc = finalV;
      if (finalTrain) finalTrain.textContent = `${Math.round(finalT * 100)}%`;
      if (finalVal) finalVal.textContent = `${Math.round(finalV * 100)}%`;
      if (progressEl) {
        const heading = progressEl.querySelector('h3');
        if (heading) heading.textContent = 'Training Progress (Completed)';
      }
      if (done) done.style.display = 'block';

      enableTabButton(4);
      alert(`Training complete!\nTrain Accuracy: ${Math.round(finalT * 100)}%\nVal Accuracy: ${Math.round(finalV * 100)}%`);
    }
  }, 300);
}

// =========================
// Evaluate Tab (Tab 4)
// =========================
function wireEvaluateTab() {
  const btn = $('evaluateBtn');
  if (!btn) return;
  btn.addEventListener('click', runEvaluation);
  const reportBtn = $('downloadReportBtn');
  if (reportBtn) reportBtn.addEventListener('click', downloadReport);
}

function runEvaluation() {
  // Fake some metrics
  const overall = $('overallAccuracy');
  const prec = $('precision');
  const rec = $('recall');
  const spec = $('specificity');
  const results = $('evaluationResults');
  const cm = $('confusionMatrix');
  const rocCanvas = $('rocCurve');

  // Base on validation accuracy
  const base = appState.training.finalValAcc || 0.87;
  const acc = Math.max(0.75, Math.min(0.98, base + (Math.random() * 0.04 - 0.02)));
  const precision = Math.max(0.7, Math.min(0.98, acc - 0.02 + (Math.random()*0.03 - 0.015)));
  const recall = Math.max(0.7, Math.min(0.98, acc - 0.01 + (Math.random()*0.03 - 0.015)));
  const specificity = Math.max(0.7, Math.min(0.98, acc + 0.01 + (Math.random()*0.03 - 0.015)));

  appState.evaluation.accuracy = acc;
  appState.evaluation.precision = precision;
  appState.evaluation.recall = recall;
  appState.evaluation.specificity = specificity;
  appState.evaluation.yourModelAcc = acc;

  if (overall) overall.textContent = `${Math.round(acc * 100)}%`;
  if (prec) prec.textContent = `${Math.round(precision * 100)}%`;
  if (rec) rec.textContent = `${Math.round(recall * 100)}%`;
  if (spec) spec.textContent = `${Math.round(specificity * 100)}%`;

  // Simple 3x3 confusion matrix (benign, malignant, normal)
  if (cm) {
    const total = 120;
    const tp = Math.round(total * acc);
    const fp = Math.round((total - tp) * 0.3);
    const fn = (total - tp) - fp;
    const m = [
      [Math.round(tp * 0.45), Math.round(fp * 0.3), Math.round(fn * 0.25)],
      [Math.round(fp * 0.35), Math.round(tp * 0.4), Math.round(fn * 0.25)],
      [Math.round(fn * 0.2), Math.round(fp * 0.3), Math.round(tp * 0.5)]
    ];
    cm.innerHTML = `
      <table class="cm-table">
        <thead>
          <tr><th></th><th>Pred: Benign</th><th>Pred: Malignant</th><th>Pred: Normal</th></tr>
        </thead>
        <tbody>
          <tr><th>True Benign</th><td>${m[0][0]}</td><td>${m[0][1]}</td><td>${m[0][2]}</td></tr>
          <tr><th>True Malignant</th><td>${m[1][0]}</td><td>${m[1][1]}</td><td>${m[1][2]}</td></tr>
          <tr><th>True Normal</th><td>${m[2][0]}</td><td>${m[2][1]}</td><td>${m[2][2]}</td></tr>
        </tbody>
      </table>
    `;
  }

  // ROC curve
  if ($('rocCurve')) {
    if (appState.evaluation.rocChart) appState.evaluation.rocChart.destroy();
    const points = Array.from({ length: 20 }, (_, i) => i / 19);
    const tpr = points.map(p => Math.min(1, Math.pow(p, 0.7) * acc + (Math.random()*0.06 - 0.03)));
    appState.evaluation.rocChart = new Chart($('rocCurve'), {
      type: 'line',
      data: {
        labels: points.map(p => p.toFixed(2)),
        datasets: [{ label: 'ROC', data: tpr }]
      },
      options: {
        responsive: true,
        animation: false,
        scales: { y: { min: 0, max: 1 }, x: { min: 0, max: 1 } }
      }
    });
  }

  if (results) results.style.display = 'block';
  enableTabButton(5);
  alert('Evaluation complete! Check the metrics below and proceed to Test & Explore.');
}

function downloadReport() {
  const ds = appState.selectedDataset ? datasets[appState.selectedDataset] : null;
  const datasetName = ds ? ds.name : 'N/A';
  const finalTrain = appState.training.finalTrainAcc;
  const finalVal = appState.training.finalValAcc;
  const acc = appState.evaluation.accuracy;
  const precision = appState.evaluation.precision;
  const recall = appState.evaluation.recall;
  const specificity = appState.evaluation.specificity;
  let report = `Dataset: ${datasetName}\n`;
  report += `Final Training Accuracy: ${Math.round((finalTrain || 0) * 100)}%\n`;
  report += `Final Validation Accuracy: ${Math.round((finalVal || 0) * 100)}%\n`;
  report += `Overall Accuracy: ${Math.round((acc || 0) * 100)}%\n`;
  report += `Precision: ${Math.round((precision || 0) * 100)}%\n`;
  report += `Recall: ${Math.round((recall || 0) * 100)}%\n`;
  report += `Specificity: ${Math.round((specificity || 0) * 100)}%\n`;
  const blob = new Blob([report], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'AI_Model_Results.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// =========================
// Test & Explore (Tab 5)
// =========================
function wireTestExploreTab() {
  const randBtn = $('randomImageBtn');
  const predictBtn = $('predictBtn');
  const repredict = $('repredictBtn');
  const sel = $('testImageSelect');
  const explainBtn = $('showExplanationBtn');

  if (sel) {
    sel.addEventListener('change', () => {
      if (sel.value) {
        appState.test.currentImage = { filename: sel.value.split('/').pop(), path: sel.value };
        displayTestImage();
      }
    });
  }
  if (randBtn) randBtn.addEventListener('click', fetchRandomTestImage);
  if (predictBtn) predictBtn.addEventListener('click', predictDiagnosis);
  if (repredict) repredict.addEventListener('click', repredictWithChanges);
  if (explainBtn) explainBtn.addEventListener('click', showHeatmap);

  populateTestImageSelect().catch(console.warn);
}

async function populateTestImageSelect() {
  const sel = $('testImageSelect');
  if (!sel) return;
  sel.innerHTML = `<option value="">Choose a test image...</option>`;
  let classes;
  if (appState.selectedDataset === 'chest_xray') {
    classes = ['normal', 'pneumonia'];
  } else {
    classes = ['benign', 'malignant', 'normal'];
  }
  for (const c of classes) {
    try {
      const result = await apiGet(`/api/images/${encodeURIComponent(c)}?limit=30&dataset=${appState.selectedDataset}`);
      if (result && result.success && Array.isArray(result.images)) {
        result.images.slice(0, 10).forEach(img => {
          const opt = document.createElement('option');
          opt.value = img.path;
          opt.text = `${c.toUpperCase()}: ${img.filename}`;
          sel.appendChild(opt);
        });
      }
    } catch (e) {
      // If class doesn't exist locally, skip silently
    }
  }
}

async function fetchRandomTestImage() {
  try {
    const result = await apiPost('/api/fetch-test-image', { datasetKey: appState.selectedDataset });
    if (result && result.success && result.image) {
      appState.test.currentImage = result.image;
      displayTestImage();
    } else {
      alert('No test image available.');
    }
  } catch (err) {
    console.error('Random image error:', err);
    alert('Failed to fetch a random test image.');
  }
}

function displayTestImage() {
  const container = $('testImage');
  const wrapper = $('testDisplay');
  if (!container || !wrapper) return;
  const img = appState.test.currentImage;
  if (!img) return;
  $('predictionResults').style.display = 'none';
  $('heatmapDisplay').style.display = 'none';
  $('predictionComparison').style.display = 'none';
  appState.test.originalPrediction = null;
  appState.test.modifiedPrediction = null;
  if ($('predictionLabel')) $('predictionLabel').textContent = '--';
  if ($('confidenceValue')) $('confidenceValue').textContent = '--';
  if ($('confidenceBar')) $('confidenceBar').style.width = '0%';
  container.innerHTML = `
    <img src="${API_BASE_URL}${img.path}" alt="${img.filename || 'test'}"
         style="max-width:100%;height:auto;border:2px solid var(--color-border);border-radius:8px;" />
    <p style="margin-top:12px;color:var(--color-text-secondary);">${img.filename || ''}</p>
  `;
  wrapper.style.display = 'block';
}

function predictDiagnosis() {
  const resultsWrap = $('predictionResults');
  const labelEl = $('predictionLabel');
  const confVal = $('confidenceValue');
  const confBar = $('confidenceBar');
  const comparison = $('predictionComparison');
  const orig = $('originalPrediction');
  const mod = $('modifiedPrediction');

  // Simulated prediction influenced by perturbations
  const { noise, brightness, blur } = appState.perturbations;
  const noisePenalty = noise * 0.0015;
  const blurPenalty = blur * 0.01;
  const brightPenalty = Math.abs(brightness - 100) * 0.002;
  const base = 0.9 - (noisePenalty + blurPenalty + brightPenalty);
  const conf = Math.max(0.5, Math.min(0.99, base + (Math.random() * 0.06 - 0.03)));
  const classes = (appState.selectedDataset === 'chest_xray') ? ['Normal', 'Pneumonia'] : ['Benign', 'Malignant', 'Normal'];
  const label = classes[Math.floor(Math.random() * classes.length)];

  appState.test.originalPrediction = { label, confidence: conf };

  if (labelEl) labelEl.textContent = label;
  if (confVal) confVal.textContent = `${Math.round(conf * 100)}%`;
  if (confBar) confBar.style.width = `${Math.round(conf * 100)}%`;
  if (resultsWrap) resultsWrap.style.display = 'block';
  if (comparison) comparison.style.display = 'none';
}

function repredictWithChanges() {
  const comparison = $('predictionComparison');
  const orig = $('originalPrediction');
  const mod = $('modifiedPrediction');

  if (!appState.test.originalPrediction) {
    alert('Make a prediction first.');
    return;
  }
  const { noise, brightness, blur } = appState.perturbations;
  const penalty = noise * 0.0015 + blur * 0.01 + Math.abs(brightness - 100) * 0.002;
  const conf = Math.max(0.3, Math.min(0.98, appState.test.originalPrediction.confidence - penalty + (Math.random() * 0.04 - 0.02)));
  const classes = (appState.selectedDataset === 'chest_xray') ? ['Normal', 'Pneumonia'] : ['Benign', 'Malignant', 'Normal'];
  const label = classes[Math.floor(Math.random() * classes.length)];

  appState.test.modifiedPrediction = { label, confidence: conf };

  if (orig) {
    orig.innerHTML = `<strong>${appState.test.originalPrediction.label}</strong> @ ${Math.round(appState.test.originalPrediction.confidence * 100)}%`;
  }
  if (mod) {
    mod.innerHTML = `<strong>${label}</strong> @ ${Math.round(conf * 100)}%`;
  }
  if (comparison) comparison.style.display = 'block';
}

function showHeatmap() {
  if (!appState.test.currentImage) {
    alert('Make a prediction first.');
    return;
  }
  const heatmapDisplay = $('heatmapDisplay');
  const heatmapImgContainer = $('heatmapImage');
  if (!heatmapDisplay || !heatmapImgContainer) return;
  heatmapDisplay.style.display = 'block';
  const originalImg = document.querySelector('#testImage img');
  if (!originalImg) {
    heatmapImgContainer.textContent = 'No image available.';
    return;
  }
  const w = originalImg.naturalWidth;
  const h = originalImg.naturalHeight;
  if (!w || !h) {
    setTimeout(showHeatmap, 100);
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(originalImg, 0, 0);
  const innerR = Math.min(w, h) * 0.2;
  const outerR = Math.min(w, h) * 0.5;
  const gradient = ctx.createRadialGradient(w/2, h/2, innerR, w/2, h/2, outerR);
  gradient.addColorStop(0, 'rgba(255, 0, 0, 0.4)');
  gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  const dataUrl = canvas.toDataURL();
  heatmapImgContainer.innerHTML = `<img src="${dataUrl}" alt="Heatmap" style="max-width:100%; height:auto;" />`;
}

// =========================
// Tabs Wiring
// =========================
function wireTabs() {
  const btns = document.querySelectorAll('.tab-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    });
  });
  // Show tab 0 by default
  switchTab('0');
}

function wireReflectionToggles() {
  document.querySelectorAll('.reflection-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const content = btn.nextElementSibling;
      if (content) content.classList.toggle('active');
    });
  });
}

// =========================
// DOMContentLoaded
// =========================
document.addEventListener('DOMContentLoaded', async () => {
  wireTabs();
  wireKaggleUpload();
  wireDatasetCards();
  wireProceedToIntro();
  wireIntroTab();
  wireDataQualityTab();
  wireTrainTab();
  wireEvaluateTab();
  wireTestExploreTab();
  wireReflectionToggles();

  // Initialize datasets & previews (works even before Kaggle upload for local BUSI)
  await initializeDatasets();
  await attemptToShowSampleImages();
});
