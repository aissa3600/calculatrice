/* ==========================================================================
   NEXUS MATH STUDIO - LOGIC & CONTROLLER
   ========================================================================== */

// 1. GLOBAL STATE
let currentExpression = '';
let previousResult = null;
let isEvaluated = false;
let memoryVal = 0;
let angleMode = 'RAD'; // 'RAD' or 'DEG'
let soundEnabled = true;
let history = [];

// Graph state
let zoom = 40; // Pixels per unit
let offsetX = 0;
let offsetY = 0;
const graphFunctions = [
    { id: '1', expression: 'sin(x)*x', color: '#6366f1', visible: true },
    { id: '2', expression: 'x^2 - 4', color: '#ff007f', visible: true }
];
const colorsPalette = ['#6366f1', '#ff007f', '#10b981', '#fbbf24', '#3b82f6', '#ec4899', '#8b5cf6'];

// Active unit converter state
let currentConverterCategory = 'length';

// Active formula category
let currentFormulaCategory = 'algebra';

// ==========================================================================
// 2. MATHEMATICAL EXPRESSION EVALUATOR (SAFE PARSER)
// ==========================================================================

function tokenize(str) {
    const tokens = [];
    let i = 0;
    while (i < str.length) {
        let char = str[i];
        
        // Skip whitespace
        if (/\s/.test(char)) {
            i++;
            continue;
        }
        
        // Check for numbers (including decimals)
        if (/[0-9]/.test(char) || (char === '.' && i + 1 < str.length && /[0-9]/.test(str[i + 1]))) {
            let numStr = '';
            while (i < str.length && (/[0-9.]/.test(str[i]))) {
                numStr += str[i];
                i++;
            }
            tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
            continue;
        }
        
        // Check for alphabetic words (functions, constants, x)
        if (/[a-zA-Z]/.test(char)) {
            let word = '';
            while (i < str.length && /[a-zA-Z0-9]/.test(str[i])) {
                word += str[i];
                i++;
            }
            
            if (['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln', 'log', 'log2', 'sqrt', 'cbrt', 'abs', 'fact'].includes(word)) {
                tokens.push({ type: 'FUNCTION', value: word });
            } else if (word === 'pi') {
                tokens.push({ type: 'CONSTANT', value: Math.PI });
            } else if (word === 'e') {
                tokens.push({ type: 'CONSTANT', value: Math.E });
            } else if (word === 'x') {
                tokens.push({ type: 'VARIABLE', value: 'x' });
            } else {
                throw new Error("Symbole inconnu: " + word);
            }
            continue;
        }
        
        // Operators and parentheses
        if ('+-*/%^()'.includes(char)) {
            tokens.push({ type: 'OPERATOR', value: char });
            i++;
            continue;
        }
        
        throw new Error("Caractère inconnu: " + char);
    }
    return tokens;
}

class Parser {
    constructor(tokens, mode = 'RAD', xVal = 0) {
        this.tokens = tokens;
        this.angleMode = mode;
        this.xValue = xVal;
        this.index = 0;
    }
    
    peek() {
        return this.index < this.tokens.length ? this.tokens[this.index] : null;
    }
    
    consume() {
        return this.tokens[this.index++];
    }
    
    parse() {
        if (this.tokens.length === 0) return 0;
        const result = this.expression();
        if (this.index < this.tokens.length) {
            throw new Error("Erreur de syntaxe");
        }
        return result;
    }
    
    expression() {
        let node = this.term();
        while (true) {
            let token = this.peek();
            if (token && token.type === 'OPERATOR' && (token.value === '+' || token.value === '-')) {
                this.consume();
                let right = this.term();
                if (token.value === '+') {
                    node = node + right;
                } else {
                    node = node - right;
                }
            } else {
                break;
            }
        }
        return node;
    }
    
    term() {
        let node = this.factor();
        while (true) {
            let token = this.peek();
            if (token && token.type === 'OPERATOR' && (token.value === '*' || token.value === '/' || token.value === '%')) {
                this.consume();
                let right = this.factor();
                if (token.value === '*') {
                    node = node * right;
                } else if (token.value === '/') {
                    if (right === 0) throw new Error("Division par 0");
                    node = node / right;
                } else {
                    node = node % right;
                }
            } else {
                break;
            }
        }
        return node;
    }
    
    factor() {
        let node = this.base();
        while (true) {
            let token = this.peek();
            if (token && token.type === 'OPERATOR' && token.value === '^') {
                this.consume();
                let right = this.base();
                node = Math.pow(node, right);
            } else {
                break;
            }
        }
        return node;
    }
    
    base() {
        let token = this.peek();
        if (!token) {
            throw new Error("Expression incomplète");
        }
        
        // Unary signs
        if (token.type === 'OPERATOR' && token.value === '+') {
            this.consume();
            return this.base();
        }
        if (token.type === 'OPERATOR' && token.value === '-') {
            this.consume();
            return -this.base();
        }
        
        // Parentheses
        if (token.type === 'OPERATOR' && token.value === '(') {
            this.consume();
            let val = this.expression();
            let next = this.consume();
            if (!next || next.value !== ')') {
                throw new Error("Parenthèse fermante manquante");
            }
            return val;
        }
        
        // Numbers
        if (token.type === 'NUMBER') {
            this.consume();
            return token.value;
        }
        
        // Constants
        if (token.type === 'CONSTANT') {
            this.consume();
            return token.value;
        }
        
        // Variable x
        if (token.type === 'VARIABLE') {
            this.consume();
            return this.xValue;
        }
        
        // Functions
        if (token.type === 'FUNCTION') {
            let funcName = this.consume().value;
            let next = this.consume();
            if (!next || next.value !== '(') {
                throw new Error(`Parenthèse ouvrante requise après ${funcName}`);
            }
            let arg = this.expression();
            let end = this.consume();
            if (!end || end.value !== ')') {
                throw new Error(`Parenthèse fermante requise pour ${funcName}`);
            }
            
            return this.evaluateFunction(funcName, arg);
        }
        
        throw new Error("Symbole inattendu: " + token.value);
    }
    
    evaluateFunction(name, arg) {
        const toRad = (val) => (this.angleMode === 'DEG' ? (val * Math.PI) / 180 : val);
        const fromRad = (val) => (this.angleMode === 'DEG' ? (val * 180) / Math.PI : val);
        
        switch (name) {
            case 'sin': return Math.sin(toRad(arg));
            case 'cos': return Math.cos(toRad(arg));
            case 'tan': return Math.tan(toRad(arg));
            case 'asin': return fromRad(Math.asin(arg));
            case 'acos': return fromRad(Math.acos(arg));
            case 'atan': return fromRad(Math.atan(arg));
            case 'ln': 
                if (arg <= 0) throw new Error("Log d'une valeur négative ou nulle");
                return Math.log(arg);
            case 'log': 
                if (arg <= 0) throw new Error("Log d'une valeur négative ou nulle");
                return Math.log10(arg);
            case 'log2': 
                if (arg <= 0) throw new Error("Log d'une valeur négative ou nulle");
                return Math.log2(arg);
            case 'sqrt':
                if (arg < 0) throw new Error("Racine d'un négatif");
                return Math.sqrt(arg);
            case 'cbrt': return Math.cbrt(arg);
            case 'abs': return Math.abs(arg);
            case 'fact':
                if (arg < 0 || !Number.isInteger(arg)) throw new Error("Factorielle invalide");
                return factorial(arg);
            default:
                throw new Error("Fonction inconnue");
        }
    }
}

function factorial(n) {
    if (n > 170) throw new Error("n! dépasse la limite");
    if (n === 0 || n === 1) return 1;
    let res = 1;
    for (let i = 2; i <= n; i++) {
        res *= i;
    }
    return res;
}

function balanceParentheses(str) {
    let openCount = 0;
    for (let char of str) {
        if (char === '(') openCount++;
        else if (char === ')') openCount--;
    }
    if (openCount > 0) {
        str += ')'.repeat(openCount);
    }
    return { balancedStr: str, openCount: openCount > 0 ? openCount : 0 };
}

// Format raw string to client presentation
function formatExpressionForDisplay(expr) {
    if (!expr) return '';
    return expr
        .replace(/\*/g, '×')
        .replace(/\//g, '÷')
        .replace(/\+/g, ' + ')
        .replace(/-/g, ' − ')
        .replace(/\^/g, '^')
        .replace(/pi/g, 'π')
        .replace(/sqrt\(/g, '√(')
        .replace(/cbrt\(/g, '³√(')
        .replace(/fact\(/g, 'fact(')
        .replace(/abs\(/g, 'abs(')
        .replace(/log2\(/g, 'log₂(');
}

// Perform real-time parsing
function evaluateLiveExpression() {
    const exprDisplay = document.getElementById('expression-display');
    const resultDisplay = document.getElementById('result-display');
    const parenIndicator = document.getElementById('parentheses-indicator');
    
    // Balance and count open parentheses
    const { balancedStr, openCount } = balanceParentheses(currentExpression);
    
    // Update parenthesis indicator
    if (openCount > 0) {
        parenIndicator.textContent = `() ${openCount}`;
        parenIndicator.classList.add('active');
    } else {
        parenIndicator.textContent = `() 0`;
        parenIndicator.classList.remove('active');
    }
    
    if (!currentExpression) {
        exprDisplay.textContent = '';
        resultDisplay.textContent = '0';
        resultDisplay.classList.remove('error-text');
        return;
    }
    
    exprDisplay.textContent = formatExpressionForDisplay(currentExpression);
    
    try {
        const tokens = tokenize(balancedStr);
        const parser = new Parser(tokens, angleMode);
        const result = parser.parse();
        
        if (typeof result === 'number' && !isNaN(result)) {
            // Format results cleanly (limiting decimal overflow)
            if (Number.isInteger(result)) {
                resultDisplay.textContent = result.toString();
            } else {
                // Round to max 10 decimal digits, removing trailing zeros
                resultDisplay.textContent = parseFloat(result.toFixed(10)).toString();
            }
            resultDisplay.classList.remove('error-text');
        }
    } catch (e) {
        // Do not show errors in live-preview mode to avoid annoying the user
        // Just show previous result or empty
    }
}

// Perform final evaluation when '=' is pressed
function executeCalculation() {
    const resultDisplay = document.getElementById('result-display');
    const exprDisplay = document.getElementById('expression-display');
    
    if (!currentExpression) return;
    
    const { balancedStr } = balanceParentheses(currentExpression);
    
    try {
        const tokens = tokenize(balancedStr);
        const parser = new Parser(tokens, angleMode);
        const result = parser.parse();
        
        if (typeof result === 'number' && !isNaN(result)) {
            let finalResultStr = '';
            if (Number.isInteger(result)) {
                finalResultStr = result.toString();
            } else {
                finalResultStr = parseFloat(result.toFixed(10)).toString();
            }
            
            // Render full evaluation on display
            exprDisplay.textContent = formatExpressionForDisplay(currentExpression) + ' =';
            resultDisplay.textContent = finalResultStr;
            resultDisplay.classList.remove('error-text');
            
            // Add to history
            addHistoryItem(currentExpression, finalResultStr);
            
            // Update state
            previousResult = finalResultStr;
            currentExpression = finalResultStr; // Allow chaining calculations
            isEvaluated = true;
        } else {
            throw new Error("Résultat indéfini");
        }
    } catch (e) {
        resultDisplay.textContent = e.message;
        resultDisplay.classList.add('error-text');
        isEvaluated = true;
    }
}

// Handle inputs
function handleInput(val) {
    if (isEvaluated) {
        // If calculation was just computed
        if (['+', '-', '*', '/', '%', '^'].includes(val)) {
            // operator chains previous result
            isEvaluated = false;
        } else {
            // number or function starts fresh expression
            currentExpression = '';
            isEvaluated = false;
        }
    }
    
    // Prevent double operators
    if (['+', '*', '/', '%', '^'].includes(val) && currentExpression === '') {
        // can't start with binary operator except unary minus
        return;
    }
    
    currentExpression += val;
    evaluateLiveExpression();
}

function handleAction(action) {
    switch (action) {
        case 'clear':
            currentExpression = '';
            isEvaluated = false;
            evaluateLiveExpression();
            break;
            
        case 'backspace':
            if (isEvaluated) {
                currentExpression = '';
                isEvaluated = false;
            } else if (currentExpression.length > 0) {
                // Check if deleting a function name, backspace it fully
                const functions = ['sin(', 'cos(', 'tan(', 'asin(', 'acos(', 'atan(', 'sqrt(', 'cbrt(', 'fact(', 'abs(', 'log2(', 'log(', 'ln('];
                let deletedFunc = false;
                for (let func of functions) {
                    if (currentExpression.endsWith(func)) {
                        currentExpression = currentExpression.substring(0, currentExpression.length - func.length);
                        deletedFunc = true;
                        break;
                    }
                }
                if (!deletedFunc) {
                    currentExpression = currentExpression.substring(0, currentExpression.length - 1);
                }
            }
            evaluateLiveExpression();
            break;
            
        case 'equal':
            executeCalculation();
            break;
            
        case 'toggle-angle':
            angleMode = angleMode === 'RAD' ? 'DEG' : 'RAD';
            const btn = document.getElementById('angle-toggle');
            btn.textContent = angleMode === 'RAD' ? 'DEG' : 'RAD';
            document.getElementById('angle-mode-indicator').textContent = angleMode;
            evaluateLiveExpression();
            break;
            
        // Memory actions
        case 'mc':
            memoryVal = 0;
            updateMemoryIndicator();
            break;
        case 'mr':
            handleInput(memoryVal.toString());
            break;
        case 'mplus':
            try {
                const { balancedStr } = balanceParentheses(currentExpression);
                const tokens = tokenize(balancedStr);
                const parser = new Parser(tokens, angleMode);
                const res = parser.parse();
                if (!isNaN(res)) {
                    memoryVal += res;
                    updateMemoryIndicator();
                }
            } catch(e) {}
            break;
        case 'mminus':
            try {
                const { balancedStr } = balanceParentheses(currentExpression);
                const tokens = tokenize(balancedStr);
                const parser = new Parser(tokens, angleMode);
                const res = parser.parse();
                if (!isNaN(res)) {
                    memoryVal -= res;
                    updateMemoryIndicator();
                }
            } catch(e) {}
            break;
        case 'ms':
            try {
                const { balancedStr } = balanceParentheses(currentExpression);
                const tokens = tokenize(balancedStr);
                const parser = new Parser(tokens, angleMode);
                const res = parser.parse();
                if (!isNaN(res)) {
                    memoryVal = res;
                    updateMemoryIndicator();
                }
            } catch(e) {}
            break;
    }
}

function updateMemoryIndicator() {
    const indicator = document.getElementById('memory-indicator');
    if (memoryVal !== 0) {
        indicator.classList.add('active');
        indicator.textContent = `M: ${parseFloat(memoryVal.toFixed(4))}`;
    } else {
        indicator.classList.remove('active');
        indicator.textContent = 'M';
    }
}

// ==========================================================================
// 3. GRAPHING MODULE (CANVAS RENDERER)
// ==========================================================================
const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');

function initGraph() {
    // Reset view
    zoom = 45;
    offsetX = 0;
    offsetY = 0;
    
    // Draw initial
    resizeCanvas();
    renderFunctionsList();
}

function drawGraph() {
    if (!canvas.width || !canvas.height) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const cx = canvas.width / 2 + offsetX;
    const cy = canvas.height / 2 + offsetY;
    
    // 1. Draw grid
    drawGrid(cx, cy);
    
    // 2. Draw functions
    drawFunctions(cx, cy);
}

function drawGrid(cx, cy) {
    // Adaptive Grid interval
    // Minimum 40px spacing between lines
    const minSpacing = 50;
    let valPerGrid = 1;
    const ratio = minSpacing / zoom;
    
    if (ratio > 1) {
        valPerGrid = Math.pow(10, Math.ceil(Math.log10(ratio)));
        if (valPerGrid / 2 > ratio) valPerGrid /= 2;
        if (valPerGrid / 5 > ratio) valPerGrid /= 5;
    } else {
        const order = Math.ceil(Math.log10(ratio));
        valPerGrid = Math.pow(10, order);
        if (valPerGrid * 2 < ratio) valPerGrid *= 2;
        if (valPerGrid * 5 < ratio) valPerGrid *= 5;
    }
    
    const pxPerGrid = valPerGrid * zoom;
    
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--glass-border').trim() || 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    
    // Draw vertical grid lines
    let startX = cx % pxPerGrid;
    if (startX < 0) startX += pxPerGrid;
    for (let x = startX; x < canvas.width; x += pxPerGrid) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    
    // Draw horizontal grid lines
    let startY = cy % pxPerGrid;
    if (startY < 0) startY += pxPerGrid;
    for (let y = startY; y < canvas.height; y += pxPerGrid) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
    // Draw Axis lines
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#94a3b8';
    ctx.lineWidth = 1.5;
    
    // X Axis
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(canvas.width, cy);
    ctx.stroke();
    
    // Y Axis
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, canvas.height);
    ctx.stroke();
    
    // Draw Ticks & Labels
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#94a3b8';
    ctx.font = '10px Outfit';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    // X tick labels
    let labelOffset = 5;
    let stepCount = Math.floor(cx / pxPerGrid);
    for (let x = cx - stepCount * pxPerGrid; x < canvas.width; x += pxPerGrid) {
        const mathX = (x - cx) / zoom;
        if (Math.abs(mathX) > 1e-10) {
            ctx.beginPath();
            ctx.moveTo(x, cy - 3);
            ctx.lineTo(x, cy + 3);
            ctx.stroke();
            
            // Format labels nicely
            let label = parseFloat(mathX.toFixed(5)).toString();
            ctx.fillText(label, x, cy + labelOffset);
        }
    }
    
    // Y tick labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    stepCount = Math.floor(cy / pxPerGrid);
    for (let y = cy - stepCount * pxPerGrid; y < canvas.height; y += pxPerGrid) {
        const mathY = (cy - y) / zoom;
        if (Math.abs(mathY) > 1e-10) {
            ctx.beginPath();
            ctx.moveTo(cx - 3, y);
            ctx.lineTo(cx + 3, y);
            ctx.stroke();
            
            let label = parseFloat(mathY.toFixed(5)).toString();
            ctx.fillText(label, cx - labelOffset, y);
        }
    }
    
    // Origin (0,0) label
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText("0", cx - 4, cy + 4);
}

function drawFunctions(cx, cy) {
    graphFunctions.forEach(func => {
        if (!func.visible) return;
        
        ctx.beginPath();
        let first = true;
        
        // Loop screen pixels horizontally to sample x
        for (let px = 0; px <= canvas.width; px++) {
            const x = (px - cx) / zoom;
            try {
                // Parse graphing expression safely
                const tokens = tokenize(func.expression);
                // Graphing is standard in RAD
                const parser = new Parser(tokens, 'RAD', x);
                const y = parser.parse();
                
                if (typeof y === 'number' && !isNaN(y) && isFinite(y)) {
                    const py = cy - y * zoom;
                    // Cap pixel values to prevent drawing bugs on overflow
                    if (py >= -1000 && py <= canvas.height + 1000) {
                        if (first) {
                            ctx.moveTo(px, py);
                            first = false;
                        } else {
                            ctx.lineTo(px, py);
                        }
                    } else {
                        first = true;
                    }
                } else {
                    first = true;
                }
            } catch (e) {
                // Break curve on evaluation errors
                first = true;
            }
        }
        
        ctx.strokeStyle = func.color;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.stroke();
    });
}

function renderFunctionsList() {
    const list = document.getElementById('active-functions-list');
    list.innerHTML = '';
    
    graphFunctions.forEach((func, idx) => {
        const item = document.createElement('div');
        item.className = 'function-item';
        item.innerHTML = `
            <div class="fn-color-indicator" style="background-color: ${func.color}"></div>
            <div class="fn-text">y = ${func.expression}</div>
            <div class="fn-actions">
                <button class="fn-btn toggle-visibility" data-id="${func.id}" title="Afficher/Masquer">
                    <i class="fa-solid ${func.visible ? 'fa-eye' : 'fa-eye-slash'}"></i>
                </button>
                <button class="fn-btn delete-fn" data-id="${func.id}" title="Supprimer">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
        list.appendChild(item);
    });
}

function resizeCanvas() {
    if (document.getElementById('tab-grapher').classList.contains('active')) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
        drawGraph();
    }
}

// Add function to graphing
function addFunction() {
    const input = document.getElementById('graph-expression');
    let expr = input.value.trim().toLowerCase();
    
    if (!expr) return;
    
    // Quick validation check
    try {
        const tokens = tokenize(expr);
        const parser = new Parser(tokens, 'RAD', 1);
        parser.parse();
    } catch(e) {
        alert("Expression mathématique invalide: " + e.message);
        return;
    }
    
    // Choose next color in palette
    const color = colorsPalette[graphFunctions.length % colorsPalette.length];
    
    graphFunctions.push({
        id: Date.now().toString(),
        expression: expr,
        color: color,
        visible: true
    });
    
    input.value = '';
    renderFunctionsList();
    drawGraph();
    playClickSound();
}

function updateCoordsIndicator(mathX, mathY) {
    const label = document.getElementById('coord-val');
    label.textContent = `x: ${mathX.toFixed(3)}, y: ${mathY.toFixed(3)}`;
}

// Preset graph configurations
function applyGraphPreset(preset) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    
    switch (preset) {
        case 'standard':
            zoom = 45;
            offsetX = 0;
            offsetY = 0;
            break;
        case 'trig':
            // Zoom wider on X axis
            zoom = 50;
            offsetX = 0;
            offsetY = 0;
            break;
        case 'positive':
            // Shift origin to bottom left quadrant
            zoom = 45;
            offsetX = -canvas.width * 0.4;
            offsetY = canvas.height * 0.4;
            break;
    }
    drawGraph();
    playClickSound();
}

// Hook graphing mouse drag events
let isDragging = false;
let startX, startY;

canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX - offsetX;
    startY = e.clientY - offsetY;
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    const cx = canvas.width / 2 + offsetX;
    const cy = canvas.height / 2 + offsetY;
    const x = (mx - cx) / zoom;
    const y = (cy - my) / zoom;
    
    updateCoordsIndicator(x, y);
    
    if (isDragging) {
        offsetX = e.clientX - startX;
        offsetY = e.clientY - startY;
        drawGraph();
    }
});

canvas.addEventListener('mouseup', () => { isDragging = false; });
canvas.addEventListener('mouseleave', () => { isDragging = false; });

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    const mathX = (mx - (canvas.width / 2 + offsetX)) / zoom;
    const mathY = ((canvas.height / 2 + offsetY) - my) / zoom;
    
    zoom = Math.min(Math.max(zoom * zoomFactor, 1.5), 6000);
    
    offsetX = mx - canvas.width / 2 - mathX * zoom;
    offsetY = my - canvas.height / 2 + mathY * zoom;
    
    drawGraph();
});

// Canvas controls buttons
document.getElementById('zoom-in-btn').addEventListener('click', () => {
    zoom = Math.min(zoom * 1.3, 6000);
    drawGraph();
    playClickSound();
});

document.getElementById('zoom-out-btn').addEventListener('click', () => {
    zoom = Math.max(zoom * 0.7, 1.5);
    drawGraph();
    playClickSound();
});

document.getElementById('reset-view-btn').addEventListener('click', () => {
    applyGraphPreset('standard');
});

// Graph sidebar delegation
document.getElementById('active-functions-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.fn-btn');
    if (!btn) return;
    
    playClickSound();
    const id = btn.dataset.id;
    const index = graphFunctions.findIndex(f => f.id === id);
    if (index === -1) return;
    
    if (btn.classList.contains('toggle-visibility')) {
        graphFunctions[index].visible = !graphFunctions[index].visible;
        renderFunctionsList();
        drawGraph();
    } else if (btn.classList.contains('delete-fn')) {
        graphFunctions.splice(index, 1);
        renderFunctionsList();
        drawGraph();
    }
});

document.getElementById('add-function-btn').addEventListener('click', addFunction);
document.getElementById('graph-expression').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addFunction();
});

// Preset buttons
document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const preset = e.target.dataset.preset;
        applyGraphPreset(preset);
    });
});


// ==========================================================================
// 4. UNIT CONVERTER MODULE
// ==========================================================================
const converterData = {
    length: {
        units: {
            m: { label: "Mètres (m)", factor: 1 },
            km: { label: "Kilomètres (km)", factor: 1000 },
            cm: { label: "Centimètres (cm)", factor: 0.01 },
            mm: { label: "Millimètres (mm)", factor: 0.001 },
            mi: { label: "Milles (mi)", factor: 1609.344 },
            yd: { label: "Yards (yd)", factor: 0.9144 },
            ft: { label: "Pieds (ft)", factor: 0.3048 },
            in: { label: "Pouces (in)", factor: 0.0254 }
        }
    },
    mass: {
        units: {
            kg: { label: "Kilogrammes (kg)", factor: 1 },
            g: { label: "Grammes (g)", factor: 0.001 },
            mg: { label: "Milligrammes (mg)", factor: 0.000001 },
            lb: { label: "Livres (lb)", factor: 0.45359237 },
            oz: { label: "Onces (oz)", factor: 0.028349523 },
            ton: { label: "Tonnes (t)", factor: 1000 }
        }
    },
    area: {
        units: {
            m2: { label: "Mètres carrés (m²)", factor: 1 },
            km2: { label: "Kilomètres carrés (km²)", factor: 1000000 },
            cm2: { label: "Centimètres carrés (cm²)", factor: 0.0001 },
            hectare: { label: "Hectares (ha)", factor: 10000 },
            acre: { label: "Acres (ac)", factor: 4046.8564 }
        }
    },
    volume: {
        units: {
            l: { label: "Litres (L)", factor: 1 },
            ml: { label: "Millilitres (mL)", factor: 0.001 },
            m3: { label: "Mètres cubes (m³)", factor: 1000 },
            gal: { label: "Galons US (gal)", factor: 3.78541 },
            cup: { label: "Tasses US (cup)", factor: 0.236588 }
        }
    },
    temperature: {
        units: {
            c: { label: "Degrés Celsius (°C)" },
            f: { label: "Degrés Fahrenheit (°F)" },
            k: { label: "Kelvin (K)" }
        },
        convert: (value, from, to) => {
            let celsius;
            if (from === 'c') celsius = value;
            else if (from === 'f') celsius = (value - 32) * 5/9;
            else if (from === 'k') celsius = value - 273.15;
            
            if (to === 'c') return celsius;
            else if (to === 'f') return celsius * 9/5 + 32;
            else if (to === 'k') return celsius + 273.15;
        }
    },
    speed: {
        units: {
            mps: { label: "Mètres par seconde (m/s)", factor: 1 },
            kmh: { label: "Kilomètres par heure (km/h)", factor: 1 / 3.6 },
            mph: { label: "Milles par heure (mph)", factor: 0.44704 },
            knot: { label: "Nœuds (kt)", factor: 0.514444 }
        }
    },
    time: {
        units: {
            s: { label: "Secondes (s)", factor: 1 },
            ms: { label: "Millisecondes (ms)", factor: 0.001 },
            min: { label: "Minutes (min)", factor: 60 },
            h: { label: "Heures (h)", factor: 3600 },
            d: { label: "Jours (j)", factor: 86400 },
            wk: { label: "Semaines (sem)", factor: 604800 },
            yr: { label: "Années (an)", factor: 31536000 }
        }
    },
    data: {
        units: {
            b: { label: "Octets (B)", factor: 1 },
            kb: { label: "Kilooctets (KB)", factor: 1024 },
            mb: { label: "Mégaoctets (MB)", factor: 1024 * 1024 },
            gb: { label: "Gigaoctets (GB)", factor: 1024 * 1024 * 1024 },
            tb: { label: "Téraoctets (TB)", factor: 1024 * 1024 * 1024 * 1024 }
        }
    }
};

function initConverter() {
    populateConverterUnits();
    performConversion();
}

function populateConverterUnits() {
    const fromSelect = document.getElementById('converter-from-unit');
    const toSelect = document.getElementById('converter-to-unit');
    
    fromSelect.innerHTML = '';
    toSelect.innerHTML = '';
    
    const catData = converterData[currentConverterCategory];
    
    Object.keys(catData.units).forEach((unitKey, idx) => {
        const optFrom = document.createElement('option');
        optFrom.value = unitKey;
        optFrom.textContent = catData.units[unitKey].label;
        fromSelect.appendChild(optFrom);
        
        const optTo = document.createElement('option');
        optTo.value = unitKey;
        optTo.textContent = catData.units[unitKey].label;
        // set second unit as default target unit
        if (idx === 1) optTo.selected = true;
        toSelect.appendChild(optTo);
    });
}

function performConversion() {
    const fromInput = document.getElementById('converter-from-input');
    const toInput = document.getElementById('converter-to-input');
    const fromUnit = document.getElementById('converter-from-unit').value;
    const toUnit = document.getElementById('converter-to-unit').value;
    
    const val = parseFloat(fromInput.value);
    
    if (isNaN(val)) {
        toInput.value = '';
        return;
    }
    
    const catData = converterData[currentConverterCategory];
    let convertedVal;
    
    if (currentConverterCategory === 'temperature') {
        convertedVal = catData.convert(val, fromUnit, toUnit);
    } else {
        // Convert to base unit then to target unit
        const baseValue = val * catData.units[fromUnit].factor;
        convertedVal = baseValue / catData.units[toUnit].factor;
    }
    
    // Format output
    if (Number.isInteger(convertedVal)) {
        toInput.value = convertedVal.toString();
    } else {
        toInput.value = parseFloat(convertedVal.toFixed(8)).toString();
    }
}

// Hook converter UI events
document.querySelectorAll('.category-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        const btn = e.target.closest('.category-tab');
        document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        
        currentConverterCategory = btn.dataset.category;
        populateConverterUnits();
        performConversion();
        playClickSound();
    });
});

document.getElementById('converter-from-input').addEventListener('input', performConversion);
document.getElementById('converter-from-unit').addEventListener('change', performConversion);
document.getElementById('converter-to-unit').addEventListener('change', performConversion);

document.getElementById('converter-swap-btn').addEventListener('click', () => {
    const fromSelect = document.getElementById('converter-from-unit');
    const toSelect = document.getElementById('converter-to-unit');
    const fromVal = fromSelect.value;
    const toVal = toSelect.value;
    
    fromSelect.value = toVal;
    toSelect.value = fromVal;
    
    performConversion();
    playClickSound();
});


// ==========================================================================
// 5. INTERACTIVE FORMULAS MODULE
// ==========================================================================
const formulasData = {
    algebra: [
        {
            name: "Équation Quadratique (Second Degré)",
            math: "ax² + bx + c = 0",
            desc: "Calcule les racines d'une équation du second degré.",
            inputs: [
                { name: 'a', label: 'Coefficient a' },
                { name: 'b', label: 'Coefficient b' },
                { name: 'c', label: 'Coefficient c' }
            ],
            solve: (inputs) => {
                const a = parseFloat(inputs.a);
                const b = parseFloat(inputs.b);
                const c = parseFloat(inputs.c);
                if (isNaN(a) || isNaN(b) || isNaN(c)) return "Champs incomplets.";
                if (a === 0) return "Le coefficient 'a' ne peut pas être 0.";
                
                const delta = b * b - 4 * a * c;
                if (delta > 0) {
                    const x1 = (-b + Math.sqrt(delta)) / (2 * a);
                    const x2 = (-b - Math.sqrt(delta)) / (2 * a);
                    return `Δ = ${delta.toFixed(4)}<br>x₁ = ${x1.toFixed(6)}<br>x₂ = ${x2.toFixed(6)}`;
                } else if (delta === 0) {
                    const x0 = -b / (2 * a);
                    return `Δ = 0<br>x₀ = ${x0.toFixed(6)}`;
                } else {
                    const real = (-b / (2 * a)).toFixed(6);
                    const imag = (Math.sqrt(-delta) / (2 * a)).toFixed(6);
                    return `Δ = ${delta.toFixed(4)}<br>x₁ = ${real} + ${imag}i<br>x₂ = ${real} - ${imag}i`;
                }
            }
        },
        {
            name: "Progression Arithmétique",
            math: "a_n = a_1 + (n − 1)d",
            desc: "Calcule le n-ième terme d'une suite arithmétique.",
            inputs: [
                { name: 'a1', label: 'Premier terme (a₁)' },
                { name: 'd', label: 'Raison commune (d)' },
                { name: 'n', label: 'Rang du terme (n)' }
            ],
            solve: (inputs) => {
                const a1 = parseFloat(inputs.a1);
                const d = parseFloat(inputs.d);
                const n = parseFloat(inputs.n);
                if (isNaN(a1) || isNaN(d) || isNaN(n)) return "Valeurs incorrectes.";
                if (n <= 0 || !Number.isInteger(n)) return "n doit être un entier positif.";
                const an = a1 + (n - 1) * d;
                return `a<sub>${n}</sub> = ${an.toFixed(6)}`;
            }
        }
    ],
    geometry: [
        {
            name: "Aire d'un Cercle",
            math: "A = πr²",
            desc: "Calcule la surface totale d'un cercle.",
            inputs: [
                { name: 'r', label: 'Rayon (r)' }
            ],
            solve: (inputs) => {
                const r = parseFloat(inputs.r);
                if (isNaN(r) || r < 0) return "Le rayon doit être positif.";
                const area = Math.PI * r * r;
                return `Aire = ${area.toFixed(6)}`;
            }
        },
        {
            name: "Aire d'un Triangle",
            math: "A = (base × hauteur) / 2",
            desc: "Trouve la surface d'un triangle.",
            inputs: [
                { name: 'b', label: 'Base' },
                { name: 'h', label: 'Hauteur' }
            ],
            solve: (inputs) => {
                const b = parseFloat(inputs.b);
                const h = parseFloat(inputs.h);
                if (isNaN(b) || isNaN(h) || b < 0 || h < 0) return "Les longueurs doivent être positives.";
                const area = (b * h) / 2;
                return `Aire = ${area.toFixed(6)}`;
            }
        },
        {
            name: "Volume d'un Cylindre",
            math: "V = πr²h",
            desc: "Calcule la capacité d'un cylindre.",
            inputs: [
                { name: 'r', label: 'Rayon de la base (r)' },
                { name: 'h', label: 'Hauteur (h)' }
            ],
            solve: (inputs) => {
                const r = parseFloat(inputs.r);
                const h = parseFloat(inputs.h);
                if (isNaN(r) || isNaN(h) || r < 0 || h < 0) return "Valeurs incorrectes.";
                const vol = Math.PI * r * r * h;
                return `Volume = ${vol.toFixed(6)}`;
            }
        }
    ],
    trigonometry: [
        {
            name: "Théorème de Pythagore",
            math: "c = √(a² + b²)",
            desc: "Trouve l'hypoténuse d'un triangle rectangle.",
            inputs: [
                { name: 'a', label: 'Côté adjacent a' },
                { name: 'b', label: 'Côté opposé b' }
            ],
            solve: (inputs) => {
                const a = parseFloat(inputs.a);
                const b = parseFloat(inputs.b);
                if (isNaN(a) || isNaN(b) || a < 0 || b < 0) return "Les côtés doivent être positifs.";
                const c = Math.sqrt(a * a + b * b);
                return `Hypoténuse c = ${c.toFixed(6)}`;
            }
        },
        {
            name: "Loi des Cosinus",
            math: "c² = a² + b² − 2ab cos(C)",
            desc: "Calcule le côté c d'un triangle quelconque (angle C en degrés).",
            inputs: [
                { name: 'a', label: 'Côté a' },
                { name: 'b', label: 'Côté b' },
                { name: 'C', label: 'Angle C (degrés)' }
            ],
            solve: (inputs) => {
                const a = parseFloat(inputs.a);
                const b = parseFloat(inputs.b);
                const C = parseFloat(inputs.C);
                if (isNaN(a) || isNaN(b) || isNaN(C) || a < 0 || b < 0) return "Champs incorrects.";
                const angleRad = (C * Math.PI) / 180;
                const c2 = a * a + b * b - 2 * a * b * Math.cos(angleRad);
                if (c2 < 0) return "Combinaison impossible.";
                const c = Math.sqrt(c2);
                return `Côté c = ${c.toFixed(6)}`;
            }
        }
    ],
    physics: [
        {
            name: "Loi d'Einstein (Équivalence Masse-Énergie)",
            math: "E = mc²",
            desc: "Convertit la masse m en énergie équivalente (c = 299 792 458 m/s).",
            inputs: [
                { name: 'm', label: 'Masse m (kg)' }
            ],
            solve: (inputs) => {
                const m = parseFloat(inputs.m);
                if (isNaN(m) || m < 0) return "La masse doit être positive.";
                const c = 299792458;
                const E = m * c * c;
                return `Énergie E = ${E.toExponential(6)} Joules`;
            }
        },
        {
            name: "Loi de Newton (Force)",
            math: "F = m × a",
            desc: "Calcule la force nette nécessaire pour accélérer un corps.",
            inputs: [
                { name: 'm', label: 'Masse m (kg)' },
                { name: 'a', label: 'Accélération a (m/s²)' }
            ],
            solve: (inputs) => {
                const m = parseFloat(inputs.m);
                const a = parseFloat(inputs.a);
                if (isNaN(m) || isNaN(a)) return "Champs manquants.";
                const F = m * a;
                return `Force F = ${F.toFixed(4)} N`;
            }
        },
        {
            name: "Loi d'Ohm",
            math: "U = R × I",
            desc: "Détermine la tension aux bornes d'un dipôle résistif.",
            inputs: [
                { name: 'R', label: 'Résistance R (Ω)' },
                { name: 'I', label: 'Intensité I (A)' }
            ],
            solve: (inputs) => {
                const R = parseFloat(inputs.R);
                const I = parseFloat(inputs.I);
                if (isNaN(R) || isNaN(I) || R < 0) return "Résistance ou courant invalide.";
                const U = R * I;
                return `Tension U = ${U.toFixed(4)} V`;
            }
        }
    ]
};

function renderFormulas() {
    const container = document.getElementById('formulas-cards-container');
    container.innerHTML = '';
    
    const catFormulas = formulasData[currentFormulaCategory];
    
    catFormulas.forEach((formula, idx) => {
        const card = document.createElement('article');
        card.className = 'formula-card';
        
        let inputsHTML = '';
        formula.inputs.forEach(input => {
            inputsHTML += `
                <div class="solver-input-group">
                    <label>${input.label}</label>
                    <input type="number" data-var="${input.name}" class="formula-var-input" placeholder="Entrez la valeur">
                </div>
            `;
        });
        
        card.innerHTML = `
            <h4>${formula.name}</h4>
            <div class="formula-math-display">${formula.math}</div>
            <p class="formula-desc">${formula.desc}</p>
            <div class="formula-solver">
                <div class="solver-inputs">
                    ${inputsHTML}
                </div>
                <div class="solver-actions">
                    <button class="solve-btn" data-index="${idx}">Calculer</button>
                </div>
                <div class="solver-result" id="result-formula-${idx}">
                    Résultat : <span class="res-val"></span>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
}

// Hook formula UI events
document.querySelectorAll('.formula-cat-item').forEach(item => {
    item.addEventListener('click', (e) => {
        const btn = e.target.closest('.formula-cat-item');
        if (!btn) return;
        document.querySelectorAll('.formula-cat-item').forEach(i => i.classList.remove('active'));
        btn.classList.add('active');
        
        currentFormulaCategory = btn.dataset.cat;
        renderFormulas();
        playClickSound();
    });
});

document.getElementById('formulas-cards-container').addEventListener('click', (e) => {
    if (e.target.classList.contains('solve-btn')) {
        playClickSound();
        const cardIndex = parseInt(e.target.dataset.index);
        const formula = formulasData[currentFormulaCategory][cardIndex];
        const card = e.target.closest('.formula-card');
        
        const inputs = {};
        card.querySelectorAll('.formula-var-input').forEach(input => {
            inputs[input.dataset.var] = input.value;
        });
        
        const res = formula.solve(inputs);
        const resultPanel = document.getElementById(`result-formula-${cardIndex}`);
        resultPanel.querySelector('.res-val').innerHTML = res;
        resultPanel.classList.add('active');
    }
});


// ==========================================================================
// 6. UI & APPLICATION FLOW (NAVIGATION, THEMES, HISTORY, KEYBOARD)
// ==========================================================================

// Tab Switching logic
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetBtn = e.target.closest('.nav-btn');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        targetBtn.classList.add('active');
        
        const targetTab = targetBtn.dataset.tab;
        document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
        
        const activePanel = document.getElementById(targetTab);
        activePanel.classList.add('active');
        
        // Custom actions on tab load
        if (targetTab === 'tab-grapher') {
            setTimeout(resizeCanvas, 50); // Give browser time to display and layout panel
        }
        
        playClickSound();
    });
});

// Sound Toggle
document.getElementById('sound-toggle-btn').addEventListener('click', (e) => {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('sound-toggle-btn');
    if (soundEnabled) {
        btn.querySelector('i').className = 'fa-solid fa-volume-high';
        btn.style.color = '';
    } else {
        btn.querySelector('i').className = 'fa-solid fa-volume-mute';
        btn.style.color = '#ef4444';
    }
    localStorage.setItem('nexus-calc-sound', soundEnabled);
});

// Sound Generator (Web Audio API synthesis)
function playClickSound() {
    if (!soundEnabled) return;
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(900, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.04);
        
        gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.04);
    } catch(e) {}
}

// Drawer toggles
const historyDrawer = document.getElementById('history-drawer');
const themeOverlay = document.getElementById('theme-overlay');
const helpModal = document.getElementById('help-modal');

document.getElementById('history-toggle-btn').addEventListener('click', () => {
    historyDrawer.classList.add('open');
    playClickSound();
});

document.getElementById('close-history-btn').addEventListener('click', () => {
    historyDrawer.classList.remove('open');
    playClickSound();
});

document.getElementById('theme-toggle-btn').addEventListener('click', () => {
    themeOverlay.classList.add('open');
    playClickSound();
});

document.getElementById('close-theme-btn').addEventListener('click', () => {
    themeOverlay.classList.remove('open');
    playClickSound();
});

themeOverlay.addEventListener('click', (e) => {
    if (e.target === themeOverlay) {
        themeOverlay.classList.remove('open');
    }
});

document.getElementById('help-toggle-btn').addEventListener('click', () => {
    helpModal.classList.add('open');
    playClickSound();
});

document.getElementById('close-help-btn').addEventListener('click', () => {
    helpModal.classList.remove('open');
    playClickSound();
});

helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) {
        helpModal.classList.remove('open');
    }
});

// Theme switcher
document.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', (e) => {
        const targetCard = e.target.closest('.theme-card');
        document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
        targetCard.classList.add('active');
        
        const theme = targetCard.dataset.theme;
        // Reset all classes on body and apply theme
        document.body.className = theme;
        
        // Save theme in local storage
        localStorage.setItem('nexus-calc-theme', theme);
        
        playClickSound();
        drawGraph(); // Redraw coordinates with new grid colors
    });
});

// History handling
function loadHistory() {
    const stored = localStorage.getItem('nexus-calc-history');
    if (stored) {
        try {
            history = JSON.parse(stored);
        } catch(e) {
            history = [];
        }
    }
    renderHistory();
}

function addHistoryItem(expr, res) {
    // Avoid double inserts
    if (history.length > 0 && history[0].expression === expr && history[0].result === res) {
        return;
    }
    history.unshift({ expression: expr, result: res });
    // Limit history length to 40 items
    if (history.length > 40) history.pop();
    
    localStorage.setItem('nexus-calc-history', JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    
    if (history.length === 0) {
        list.innerHTML = '<div class="history-empty">Aucun calcul récent</div>';
        return;
    }
    
    history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <span class="hist-expr">${formatExpressionForDisplay(item.expression)}</span>
            <span class="hist-res">${item.result}</span>
        `;
        div.addEventListener('click', () => {
            // Load history item into display
            currentExpression = item.expression;
            isEvaluated = false;
            evaluateLiveExpression();
            playClickSound();
        });
        list.appendChild(div);
    });
}

document.getElementById('clear-history-btn').addEventListener('click', () => {
    history = [];
    localStorage.removeItem('nexus-calc-history');
    renderHistory();
    playClickSound();
});

// Calculator Click events
document.querySelector('.keys-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.key');
    if (!btn) return;
    
    playClickSound();
    const action = btn.dataset.action;
    const val = btn.dataset.val;
    
    if (action) {
        handleAction(action);
    } else if (val) {
        handleInput(val);
    }
});

// Keyboard Mapping
const keyMap = {
    '0': { val: '0' },
    '1': { val: '1' },
    '2': { val: '2' },
    '3': { val: '3' },
    '4': { val: '4' },
    '5': { val: '5' },
    '6': { val: '6' },
    '7': { val: '7' },
    '8': { val: '8' },
    '9': { val: '9' },
    '.': { val: '.' },
    '+': { val: '+' },
    '-': { val: '-' },
    '*': { val: '*' },
    '/': { val: '/' },
    '%': { val: '%' },
    '^': { val: '^' },
    '(': { val: '(' },
    ')': { val: ')' },
    'Enter': { action: 'equal' },
    '=': { action: 'equal' },
    'Backspace': { action: 'backspace' },
    'Escape': { action: 'clear' },
    's': { val: 'sin(' },
    'c': { val: 'cos(' },
    't': { val: 'tan(' },
    'p': { val: 'pi' },
    'e': { val: 'e' }
};

window.addEventListener('keydown', (e) => {
    // Only capture keypresses when not writing on other input elements (e.g. graph formula or converter inputs)
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') {
        return;
    }
    
    const keyData = keyMap[e.key];
    if (!keyData) return;
    
    e.preventDefault();
    playClickSound();
    
    // Animate visual press of the matching key
    let buttonSelector = '';
    if (keyData.val) {
        buttonSelector = `.key[data-val="${keyData.val}"]`;
    } else if (keyData.action) {
        buttonSelector = `.key[data-action="${keyData.action}"]`;
    }
    
    if (buttonSelector) {
        const btnElement = document.querySelector(buttonSelector);
        if (btnElement) {
            btnElement.classList.add('pressed');
            setTimeout(() => btnElement.classList.remove('pressed'), 150);
        }
    }
    
    if (keyData.val) {
        handleInput(keyData.val);
    } else if (keyData.action) {
        handleAction(keyData.action);
    }
});


// ==========================================================================
// 7. INITIALIZATION
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
    // Restore sound preferences
    const storedSound = localStorage.getItem('nexus-calc-sound');
    if (storedSound !== null) {
        soundEnabled = storedSound === 'true';
        const btn = document.getElementById('sound-toggle-btn');
        if (!soundEnabled) {
            btn.querySelector('i').className = 'fa-solid fa-volume-mute';
            btn.style.color = '#ef4444';
        }
    }
    
    // Restore Theme preferences
    const storedTheme = localStorage.getItem('nexus-calc-theme');
    if (storedTheme) {
        document.body.className = storedTheme;
        document.querySelectorAll('.theme-card').forEach(c => {
            c.classList.remove('active');
            if (c.dataset.theme === storedTheme) {
                c.classList.add('active');
            }
        });
    }
    
    // Initialize components
    loadHistory();
    initGraph();
    initConverter();
    renderFormulas();
});
