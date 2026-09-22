const canvas = document.getElementById('drawCanvas');
const ctx = canvas.getContext('2d');
const processCanvas = document.getElementById('processCanvas');
const processCtx = processCanvas.getContext('2d');
const resultText = document.getElementById('resultText');
const clearBtn = document.getElementById('clearBtn');
const predictBtn = document.getElementById('predictBtn');
const themeToggle = document.getElementById('themeToggle');
const historyList = document.getElementById('historyList');
const mainTitle = document.getElementById('mainTitle');
const tabBtns = document.querySelectorAll('.tab-btn');
const improveBtn = document.getElementById('improveBtn');

let isDrawing = false;
let currentMode = 'chars'; 
let predictionHistory = [];
let lastResult = null; 

// Массив для запоминания штрихов рисунка пользователя
let strokes = [];

const models = {
    chars: {
        session: null,
        classes: [],
        size: 28,
        badgeText: 'Буквы',
        badgeClass: 'badge-chars',
        title: 'Распознавание: Буквы и цифры',
        hint: 'Нарисуйте один символ (цифру, букву латиницы или кириллицы) и нажмите «Распознать».'
    },
    shapes: {
        session: null,
        classes: [],
        size: 32,
        badgeText: 'Фигуры',
        badgeClass: 'badge-shapes',
        title: 'Распознавание: Фигуры и знаки',
        hint: 'Нарисуйте фигуру или знак (круг, звезда, стрелка, галочка...) и нажмите «Распознать».'
    }
};

// ==========================================
// 1. ИНИЦИАЛИЗАЦИЯ И ТЕМА
// ==========================================
const initTheme = () => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeBtnText(savedTheme);
};

const updateThemeBtnText = (theme) => {
    themeToggle.textContent = theme === 'dark' ? '☀️ Светлая тема' : '🌙 Темная тема';
};

themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeBtnText(newTheme);
});

initTheme();

// ==========================================
// 2. ЗАГРУЗКА ОБЕИХ МОДЕЛЕЙ
// ==========================================
async function loadModels() {
    try {
        resultText.innerText = "Загрузка моделей (0/2)...";
        resultText.style.color = "#f59e0b";
        
        const [charsClassesRes, shapesClassesRes] = await Promise.all([
            fetch('./model/chars/classes.json'),
            fetch('./model/shapes/classes.json'),
            
            ort.InferenceSession.create('./model/chars/model.onnx').then(s => models.chars.session = s),
            ort.InferenceSession.create('./model/shapes/model.onnx').then(s => models.shapes.session = s)
        ]);

        models.chars.classes = await charsClassesRes.json();
        models.shapes.classes = await shapesClassesRes.json();
        
        resultText.innerText = "Готово! Нарисуйте символ или фигуру.";
        resultText.style.color = "#10b981";
        predictBtn.disabled = false;
    } catch (e) {
        console.error(e);
        resultText.innerText = "Ошибка загрузки моделей!";
        resultText.style.color = "#ef4444";
    }
}
loadModels();

// ==========================================
// 3. ПЕРЕКЛЮЧЕНИЕ РЕЖИМОВ (ВКЛАДКИ)
// ==========================================
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        currentMode = btn.getAttribute('data-mode');
        
        mainTitle.innerText = models[currentMode].title;
        document.title = models[currentMode].title;
        document.getElementById('hint').innerText = models[currentMode].hint;
        
        clearCanvas();
    });
});

// ==========================================
// 4. РИСОВАНИЕ НА CANVAS И ЗАПОМИНАНИЕ ШТРИХОВ
// ==========================================
ctx.lineCap = 'round';
ctx.lineJoin = 'round';
ctx.lineWidth = 14; 
ctx.strokeStyle = 'white'; 

function startPosition(e) {
    improveBtn.hidden = true; 
    lastResult = null;
    isDrawing = true;
    
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    // Начинаем новый штрих в памяти
    strokes.push([{x, y}]);
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Точечный клик будет нарисован сразу
    ctx.lineTo(x, y + 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
}

function endPosition() {
    isDrawing = false;
    ctx.beginPath();
}

function draw(e) {
    if (!isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    const currentStroke = strokes[strokes.length - 1];
    const lastPt = currentStroke[currentStroke.length - 1];
    
    // Добавляем точку, только если было реальное смещение
    if (lastPt.x !== x || lastPt.y !== y) {
        currentStroke.push({x, y});
    }
    
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
}

canvas.addEventListener('mousedown', startPosition);
canvas.addEventListener('mouseup', endPosition);
canvas.addEventListener('mousemove', draw);

canvas.addEventListener('touchstart', startPosition);
canvas.addEventListener('touchend', endPosition);
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    draw(e);
});

function clearCanvas() {
    improveBtn.hidden = true; 
    lastResult = null;
    strokes = []; // Сбрасываем память штрихов
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    resultText.innerText = "Холст очищен";
    resultText.style.color = "#10b981";
    document.getElementById('resultPanel').hidden = true;
}
clearBtn.addEventListener('click', clearCanvas);

// ==========================================
// 5. ЕДИНАЯ УНИВЕРСАЛЬНАЯ ПРЕДОБРАБОТКА
// ==========================================
function getBoundingBox(imageData) {
    let minX = imageData.width, minY = imageData.height, maxX = -1, maxY = -1;
    let data = imageData.data;
    let found = false;

    for (let y = 0; y < imageData.height; y++) {
        for (let x = 0; x < imageData.width; x++) {
            let alpha = data[(y * imageData.width + x) * 4 + 3];
            if (alpha > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                found = true;
            }
        }
    }
    return found ? { minX, minY, maxX, maxY } : null;
}

function preprocessCanvas(targetSize) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const box = getBoundingBox(imageData);
    
    if (!box) return null;

    processCanvas.width = targetSize;
    processCanvas.height = targetSize;

    const width = box.maxX - box.minX;
    const height = box.maxY - box.minY;
    const size = Math.max(width, height);
    
    const centerX = box.minX + width / 2;
    const centerY = box.minY + height / 2;

    processCtx.fillStyle = 'black';
    processCtx.fillRect(0, 0, targetSize, targetSize);

    const padding = 4; 
    const scale = (targetSize - padding * 2) / size;

    processCtx.save();
    processCtx.translate(targetSize / 2, targetSize / 2); 
    processCtx.scale(scale, scale);
    processCtx.translate(-centerX, -centerY);
    
    processCtx.drawImage(canvas, 0, 0);
    processCtx.restore();

    const scaledData = processCtx.getImageData(0, 0, targetSize, targetSize).data;
    const tensorData = new Float32Array(targetSize * targetSize);
    
    for (let i = 0; i < targetSize * targetSize; i++) {
        const r = scaledData[i * 4];
        tensorData[i] = r / 255.0;
    }
    
    return new ort.Tensor('float32', tensorData, [1, 1, targetSize, targetSize]);
}

// ==========================================
// 6. ИНФЕРЕНС И ИСТОРИЯ
// ==========================================
function updateHistory(label, modeConfig) {
    predictionHistory.unshift({ label, modeConfig });
    if (predictionHistory.length > 5) {
        predictionHistory.pop();
    }
    
    historyList.innerHTML = '';
    predictionHistory.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'history-card';
        div.innerHTML = `
            <span class="badge ${item.modeConfig.badgeClass}">${item.modeConfig.badgeText}</span> 
            ${item.label}
        `;
        historyList.appendChild(div);
    });
}

function showDetails(logits, classes, tensorData, size) {
    const max = Math.max(...logits);
    const exps = Array.from(logits, v => Math.exp(v - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    const top = exps.map((v, i) => ({ p: v / sum, name: classes[i] }))
                    .sort((a, b) => b.p - a.p).slice(0, 5);

    document.getElementById('resultPanel').hidden = false;
    document.getElementById('bigResult').textContent = top[0].name;
    document.getElementById('previewLabel').textContent = `Превью (${size}x${size})`;
    document.getElementById('topList').innerHTML = top.map(t => `
        <div class="top-row">
            <span class="name">${t.name}</span>
            <div class="bar"><div style="width:${(t.p * 100).toFixed(1)}%"></div></div>
            <span class="pct">${(t.p * 100).toFixed(1)}%</span>
        </div>`).join('');

    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = size;
    const tctx = tmp.getContext('2d');
    const img = tctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
        const v = Math.max(0, Math.min(255, tensorData[i] * 255));
        img.data[i*4] = img.data[i*4+1] = img.data[i*4+2] = v;
        img.data[i*4+3] = 255;
    }
    tctx.putImageData(img, 0, 0);
    const pc = document.getElementById('previewCanvas');
    const pctx = pc.getContext('2d');
    pctx.imageSmoothingEnabled = false;
    pctx.clearRect(0, 0, pc.width, pc.height);
    pctx.drawImage(tmp, 0, 0, pc.width, pc.height);
}

predictBtn.addEventListener('click', async () => {
    const activeConfig = models[currentMode];
    
    if (!activeConfig.session) {
        alert("Модель еще загружается. Подождите.");
        return;
    }

    const inputTensor = preprocessCanvas(activeConfig.size);
    if (!inputTensor) {
        resultText.innerText = "Холст пуст!";
        resultText.style.color = "#ef4444";
        return;
    }

    try {
        const feeds = { input: inputTensor };
        const results = await activeConfig.session.run(feeds);
        const output = results.output.data;

        let maxIndex = 0;
        let maxValue = output[0];
        for (let i = 1; i < output.length; i++) {
            if (output[i] > maxValue) {
                maxValue = output[i];
                maxIndex = i;
            }
        }

        const predictedLabel = activeConfig.classes[maxIndex];
        resultText.innerText = `Результат: ${predictedLabel}`;
        resultText.style.color = "#10b981";
        
        showDetails(output, activeConfig.classes, inputTensor.data, activeConfig.size);
        
        updateHistory(predictedLabel, activeConfig);

        lastResult = {
            mode: currentMode,
            index: maxIndex,
            label: predictedLabel,
            box: getBoundingBox(ctx.getImageData(0, 0, canvas.width, canvas.height))
        };
        improveBtn.hidden = false;

    } catch (e) {
        console.error(e);
        resultText.innerText = "Ошибка при распознавании";
        resultText.style.color = "#ef4444";
    }
});

// ==========================================
// 7. УЛУЧШЕНИЕ РИСУНКА (Векторное для фигур, Алгоритмическое для букв)
// ==========================================

// --- Алгоритмы для выравнивания штрихов (Буквы и Цифры) ---

// a) Передискретизация
function resampleStroke(stroke) {
    if (stroke.length === 0) return [];
    if (stroke.length === 1) return [{x: stroke[0].x, y: stroke[0].y}];
    
    let totalLen = 0;
    for (let i = 1; i < stroke.length; i++) {
        const dx = stroke[i].x - stroke[i-1].x, dy = stroke[i].y - stroke[i-1].y;
        totalLen += Math.sqrt(dx*dx + dy*dy);
    }
    
    const N = Math.max(16, Math.min(64, Math.ceil(totalLen / 4)));
    const I = totalLen / (N - 1);
    
    let resampled = [{x: stroke[0].x, y: stroke[0].y}];
    let D = 0, p = 1;
    let currentPt = stroke[0];
    
    while (p < stroke.length) {
        let nextPt = stroke[p];
        let dx = nextPt.x - currentPt.x, dy = nextPt.y - currentPt.y;
        let d = Math.sqrt(dx*dx + dy*dy);
        
        if (D + d >= I) {
            let q = (I - D) / d;
            let newPt = { x: currentPt.x + dx * q, y: currentPt.y + dy * q };
            resampled.push(newPt);
            currentPt = newPt;
            D = 0;
        } else {
            D += d;
            currentPt = nextPt;
            p++;
        }
    }
    while (resampled.length < N) resampled.push({x: stroke[stroke.length-1].x, y: stroke[stroke.length-1].y});
    return resampled;
}

// b) Сглаживание
function smoothStroke(stroke, iterations = 3) {
    if (stroke.length < 3) return stroke;
    let current = stroke;
    for (let k = 0; k < iterations; k++) {
        let next = [{x: current[0].x, y: current[0].y}];
        for (let i = 1; i < current.length - 1; i++) {
            next.push({
                x: (current[i-1].x + current[i].x + current[i+1].x) / 3,
                y: (current[i-1].y + current[i].y + current[i+1].y) / 3
            });
        }
        next.push({x: current[current.length-1].x, y: current[current.length-1].y});
        current = next;
    }
    return current;
}

// c) Выравнивание наклона
function deslantStrokes(strokesList) {
    let pts = [];
    strokesList.forEach(s => pts.push(...s));
    if (pts.length < 2) return;
    
    let cx = 0, cy = 0;
    pts.forEach(p => { cx += p.x; cy += p.y; });
    cx /= pts.length; cy /= pts.length;
    
    let cov = 0, vy = 0;
    pts.forEach(p => {
        let dx = p.x - cx, dy = p.y - cy;
        cov += dx * dy;
        vy += dy * dy;
    });
    
    if (vy < 0.1) return;
    let m = cov / vy;
    const maxM = Math.tan(12 * Math.PI / 180); // Максимум 12 градусов
    m = Math.max(-maxM, Math.min(maxM, m));
    
    pts.forEach(p => p.x = p.x - m * (p.y - cy));
}

// d) Подгонка в оригинальный бокс
function fitToBox(strokesList, targetBox) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    strokesList.forEach(str => str.forEach(p => {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }));
    
    const curW = maxX - minX || 1, curH = maxY - minY || 1;
    const tarW = (targetBox.maxX - targetBox.minX) || 1;
    const tarH = (targetBox.maxY - targetBox.minY) || 1;
    
    const scaleX = tarW / curW, scaleY = tarH / curH;
    const cxCur = minX + curW / 2, cyCur = minY + curH / 2;
    const cxTar = targetBox.minX + tarW / 2, cyTar = targetBox.minY + tarH / 2;
    
    strokesList.forEach(str => str.forEach(p => {
        p.x = cxTar + (p.x - cxCur) * scaleX;
        p.y = cyTar + (p.y - cyCur) * scaleY;
    }));
}

// Интерполяция и рендеринг штрихов
function interpolateStrokes(strokesA, strokesB, t) {
    return strokesA.map((strA, i) => strA.map((ptA, j) => {
        let ptB = strokesB[i][j];
        return { x: ptA.x + (ptB.x - ptA.x) * t, y: ptA.y + (ptB.y - ptA.y) * t };
    }));
}

function renderStrokes(c, strokesList) {
    c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 14; c.strokeStyle = 'white'; c.fillStyle = 'white';
    c.beginPath();
    strokesList.forEach(stroke => {
        if (stroke.length === 0) return;
        if (stroke.length === 1) {
            c.moveTo(stroke[0].x, stroke[0].y); c.lineTo(stroke[0].x, stroke[0].y + 0.1);
            return;
        }
        c.moveTo(stroke[0].x, stroke[0].y);
        for (let i = 1; i < stroke.length - 1; i++) {
            let xc = (stroke[i].x + stroke[i+1].x) / 2;
            let yc = (stroke[i].y + stroke[i+1].y) / 2;
            c.quadraticCurveTo(stroke[i].x, stroke[i].y, xc, yc);
        }
        c.lineTo(stroke[stroke.length-1].x, stroke[stroke.length-1].y);
    });
    c.stroke();
}


// --- Алгоритмы для выравнивания Фигур (старый кроссфейд) ---
function drawIdealShape(c, i, cx, cy, r) {
    const polygon = (n, rot = -Math.PI / 2) => {
        c.beginPath();
        for (let k = 0; k < n; k++) {
            const a = rot + k * 2 * Math.PI / n;
            const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
            k ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.closePath(); c.stroke();
    };
    const path = (pts, close = false) => {
        c.beginPath();
        pts.forEach(([x, y], k) => k ? c.lineTo(cx + x * r, cy + y * r) : c.moveTo(cx + x * r, cy + y * r));
        if (close) c.closePath();
        c.stroke();
    };
    const arrowUp = () => path([[0, 1], [0, -1]]) || path([[-0.5, -0.5], [0, -1], [0.5, -0.5]]);
    const dot = (x, y) => { c.beginPath(); c.arc(cx + x * r, cy + y * r, 7, 0, Math.PI * 2); c.fill(); };

    switch (i) {
        case 0: c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke(); break;
        case 1: c.strokeRect(cx - r, cy - r, 2 * r, 2 * r); break;
        case 2: path([[0, -1], [1, 0.8], [-1, 0.8]], true); break;
        case 3: c.strokeRect(cx - r, cy - r * 0.6, 2 * r, r * 1.2); break;
        case 4: {
            c.beginPath();
            for (let k = 0; k < 10; k++) {
                const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.4 : r;
                const x = cx + rr * Math.cos(a), y = cy + Math.sin(a) * rr;
                k ? c.lineTo(x, y) : c.moveTo(x, y);
            }
            c.closePath(); c.stroke(); break;
        }
        case 5:
            c.beginPath();
            c.moveTo(cx, cy + r * 0.9);
            c.bezierCurveTo(cx + r * 1.3, cy + r * 0.2, cx + r * 0.7, cy - r * 0.9, cx, cy - r * 0.35);
            c.bezierCurveTo(cx - r * 0.7, cy - r * 0.9, cx - r * 1.3, cy + r * 0.2, cx, cy + r * 0.9);
            c.stroke(); break;
        case 6: path([[0, -1], [1, 0], [0, 1], [-1, 0]], true); break;
        case 7: polygon(5); break;
        case 8: polygon(6, 0); break;
        case 9: path([[-1, -1], [1, 1]]); path([[1, -1], [-1, 1]]); break;
        case 10: path([[0, -1], [0, 1]]); path([[-1, 0], [1, 0]]); break;
        case 11: path([[-1, 0], [-0.3, 0.8], [1, -0.8]]); break;
        case 12: case 13: case 14: case 15: {
            const angle = { 12: 0, 13: Math.PI, 14: -Math.PI / 2, 15: Math.PI / 2 }[i];
            c.save(); c.translate(cx, cy); c.rotate(angle); c.translate(-cx, -cy);
            arrowUp(); c.restore(); break;
        }
        case 16:
            c.beginPath();
            c.arc(cx, cy - r * 0.45, r * 0.45, Math.PI * 1.05, Math.PI * 2.5, false);
            c.lineTo(cx, cy + r * 0.3); c.stroke();
            dot(0, 0.85); break;
        case 17: path([[0, -1], [0, 0.4]]); dot(0, 0.9); break;
        case 18: path([[-1, -0.7], [-0.4, 0.7], [0.4, -0.7], [1, 0.7]]); break;
        case 19: {
            c.beginPath();
            for (let t = 0; t <= 3.5 * Math.PI; t += 0.1) {
                const rr = r * t / (3.5 * Math.PI);
                const x = cx + rr * Math.cos(t), y = cy + rr * Math.sin(t);
                t ? c.lineTo(x, y) : c.moveTo(x, y);
            }
            c.stroke(); break;
        }
    }
}

improveBtn.addEventListener('click', () => {
    if (!lastResult || !lastResult.box) return;
    improveBtn.hidden = true;

    if (lastResult.mode === 'shapes') {
        const original = document.createElement('canvas');
        original.width = canvas.width; original.height = canvas.height;
        original.getContext('2d').drawImage(canvas, 0, 0);

        const ideal = document.createElement('canvas');
        ideal.width = canvas.width; ideal.height = canvas.height;
        const c = ideal.getContext('2d');
        c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 14; c.strokeStyle = 'white'; c.fillStyle = 'white';
        
        const w = lastResult.box.maxX - lastResult.box.minX + 1;
        const h = lastResult.box.maxY - lastResult.box.minY + 1;
        drawIdealShape(c, lastResult.index, lastResult.box.minX + w/2, lastResult.box.minY + h/2, Math.max(Math.max(w, h) / 2 - 7, 10));

        let start = performance.now();
        function frameShapes(now) {
            let t = Math.min((now - start) / 700, 1);
            let e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1 - e; ctx.drawImage(original, 0, 0);
            ctx.globalAlpha = e;     ctx.drawImage(ideal, 0, 0);
            ctx.globalAlpha = 1;
            if (t < 1) requestAnimationFrame(frameShapes); else { ctx.beginPath(); lastResult = null; }
        }
        requestAnimationFrame(frameShapes);

    } else if (lastResult.mode === 'chars') {
        if (strokes.length === 0) return;
        
        // 1. Копируем и равномерно распределяем точки
        const originalStrokes = strokes.map(s => resampleStroke(s));
        
        // 2. Генерируем улучшенную версию
        let improvedStrokes = JSON.parse(JSON.stringify(originalStrokes));
        improvedStrokes = improvedStrokes.map(s => smoothStroke(s, 4));
        deslantStrokes(improvedStrokes);
        fitToBox(improvedStrokes, lastResult.box);

        // 3. Анимация трансформации контура
        let start = performance.now();
        function frameChars(now) {
            let t = Math.min((now - start) / 700, 1);
            let e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // Плавное начало и конец
            
            let currentFrameStrokes = interpolateStrokes(originalStrokes, improvedStrokes, e);
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            renderStrokes(ctx, currentFrameStrokes);
            
            if (t < 1) {
                requestAnimationFrame(frameChars);
            } else {
                strokes = improvedStrokes; // Перезаписываем глобальную историю
                lastResult = null;
            }
        }
        requestAnimationFrame(frameChars);
    }
});