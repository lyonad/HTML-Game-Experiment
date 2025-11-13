const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const gravity = 0.5;
let jumpStrength = -12; // kept mutable (unused by skins)
let moveSpeed = 5;      // kept mutable (unused by skins)
const friction = 0.8;

// Color variables for skins
let bgColor = '#D3D3D3';
let platformColor = '#696969';
let playerColor = '#808080';
let foodColor = '#A9A9A9';

let camera = { x: 0, y: 0 };

let player = {
    x: 100,
    y: 50,
    vx: 0,
    vy: 0,
    width: 20,
    height: 20,
    onGround: false,
    rotation: 0
};

let foods = [];
let platforms = [
    {x: 0, y: canvas.height - 20, width: 400, height: 20}, // initial ground
];

let score = 0;
let keys = {};
let lastPlatformEnd = 400;

function generatePlatform() {
    const minWidth = 80;
    const maxWidth = 150;
    const width = minWidth + Math.random() * (maxWidth - minWidth);
    const height = 20;
    const x = lastPlatformEnd + 50 + Math.random() * 100;
    const y = canvas.height - 150 - Math.random() * 150;

    platforms.push({x, y, width, height});
    lastPlatformEnd = x + width;
}

function addFoodToPlatform(platform) {
    // Remove any existing food on this platform
    foods = foods.filter(f => !(f.x >= platform.x && f.x < platform.x + platform.width));
    const foodX = platform.x + Math.random() * (platform.width - 20);
    foods.push({
        x: foodX,
        y: platform.y - 25,
        width: 15,
        height: 15,
        bounceTime: 0
    });
}

function generateFood(allowInView = false) {
    if (platforms.length > 1) {
        const platform = platforms[Math.floor(Math.random() * (platforms.length - 1)) + 1]; // skip initial ground
        const foodX = platform.x + Math.random() * (platform.width - 20);
        if (allowInView || foodX > camera.x + canvas.width) {
            addFoodToPlatform(platform);
        }
    }
}

function drawGame() {
    ctx.fillStyle = bgColor; // background color (skin)
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw platforms
    ctx.fillStyle = platformColor; // platform color (skin)
    for (let platform of platforms) {
        const screenX = platform.x - camera.x;
        if (screenX + platform.width > 0 && screenX < canvas.width) {
            ctx.fillRect(screenX, platform.y, platform.width, platform.height);
        }
    }

    // Draw player
    ctx.save();
    const playerScreenX = player.x - camera.x;
    const playerScreenY = player.y;
    const centerX = playerScreenX + player.width / 2;
    const centerY = playerScreenY + player.height / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(player.rotation);
    ctx.fillStyle = playerColor; // player color (skin)
    ctx.fillRect(-player.width / 2, -player.height / 2, player.width, player.height);
    ctx.restore();

    // Draw foods
    ctx.fillStyle = foodColor; // food color (skin)
    for (let food of foods) {
        const screenX = food.x - camera.x;
        if (screenX + food.width > 0 && screenX < canvas.width) {
            const yOffset = Math.sin(food.bounceTime) * 5;
            ctx.fillRect(screenX, food.y + yOffset, food.width, food.height);
        }
    }
}

function updatePlayer() {
    // Horizontal movement
    if (keys[37] || keys[65]) { // left arrow or A
        player.vx = -moveSpeed;
    } else if (keys[39] || keys[68]) { // right arrow or D
        player.vx = moveSpeed;
    } else {
        player.vx *= friction;
    }

    // Jump
    if ((keys[38] || keys[87] || keys[32]) && player.onGround) { // up arrow, W, or space
        player.vy = jumpStrength;
        player.onGround = false;
    }

    // Apply gravity
    player.vy += gravity;

    // Update rotation if in air
    if (!player.onGround) {
        player.rotation += 0.1; // spin speed
    } else {
        player.rotation = 0; // reset when on ground
    }

    // Update position
    player.x += player.vx;
    player.y += player.vy;

    // Update camera to follow player
    camera.x = Math.max(camera.x, Math.max(0, player.x - canvas.width * 0.25));

    // Prevent going left beyond camera
    player.x = Math.max(player.x, camera.x);

    // Generate new platforms if needed
    while (lastPlatformEnd - camera.x < canvas.width * 2) {
        generatePlatform();
        let chance = 0.2 + Math.random() * 0.5; // 20% to 70% chance
        if (Math.random() < chance) {
            addFoodToPlatform(platforms[platforms.length - 1]);
        }
    }

    // Check platform collisions
    player.onGround = false;
    for (let platform of platforms) {
        if (player.x < platform.x + platform.width &&
            player.x + player.width > platform.x &&
            player.y < platform.y + platform.height &&
            player.y + player.height > platform.y) {
            // Collision detected
            if (player.vy > 0 && player.y < platform.y) {
                // Landing on top
                player.y = platform.y - player.height;
                player.vy = 0;
                player.onGround = true;
            } else if (player.vy < 0 && player.y + player.height > platform.y + platform.height) {
                // Hitting from below
                player.y = platform.y + platform.height;
                player.vy = 0;
            } else if (player.vx > 0 && player.x < platform.x) {
                // Hitting from left
                player.x = platform.x - player.width;
                player.vx = 0;
            } else if (player.vx < 0 && player.x + player.width > platform.x + platform.width) {
                // Hitting from right
                player.x = platform.x + platform.width;
                player.vx = 0;
            }
        }
    }

    // Prevent going too far left
    if (player.x < 0) player.x = 0;

    // Game over if fall off screen
    if (player.y > canvas.height) {
        resetGame();
    }
}

function checkFoodCollision() {
    for (let i = foods.length - 1; i >= 0; i--) {
        let food = foods[i];
        if (player.x < food.x + food.width &&
            player.x + player.width > food.x &&
            player.y < food.y + food.height &&
            player.y + player.height > food.y) {
            foods.splice(i, 1);
            score += 10;
            scoreElement.textContent = `Point: ${score}`;
            saveProgress();
            generateFood();
        }
    }
}

// --- Shop logic ---
const shopOverlay = document.getElementById('shop');
const shopItemsDiv = document.getElementById('shop-items');
const closeShopBtn = document.getElementById('close-shop');

// Skin items replace the previous upgrade items. Each skin changes game colors.
const shopItems = [
    // Player skins
    { id: 'player_classic', type: 'player', name: 'Player Classic', desc: 'Default player color', price: 0, purchased: true, color: '#808080' },
    { id: 'player_mint', type: 'player', name: 'Player Mint', desc: 'Cool mint tone', price: 90, purchased: false, color: '#b8f2e6' },
    { id: 'player_blue', type: 'player', name: 'Player Blue', desc: 'Cool blue player', price: 150, purchased: false, color: '#9fb4ff' },
    { id: 'player_red', type: 'player', name: 'Player Red', desc: 'Fiery red player', price: 160, purchased: false, color: '#ff6b6b' },
    { id: 'player_neon', type: 'player', name: 'Player Neon', desc: 'Bright neon player', price: 220, purchased: false, color: '#39ff14' },
    { id: 'player_ghost', type: 'player', name: 'Player Ghost', desc: 'Pale translucent look', price: 200, purchased: false, color: '#cfcfe8' },
    { id: 'player_gold', type: 'player', name: 'Player Gold', desc: 'Premium gold skin', price: 300, purchased: false, color: '#ffd166' },

    // Background skins
    { id: 'bg_classic', type: 'background', name: 'Background Classic', desc: 'Default background', price: 0, purchased: true, color: '#D3D3D3' },
    { id: 'bg_pastel', type: 'background', name: 'Background Pastel', desc: 'Soft pastel backdrop', price: 95, purchased: false, color: '#f7e7ff' },
    { id: 'bg_midnight', type: 'background', name: 'Background Midnight', desc: 'Dark night sky', price: 150, purchased: false, color: '#1b1f2b' },
    { id: 'bg_forest', type: 'background', name: 'Background Forest', desc: 'Misty forest green', price: 170, purchased: false, color: '#d6eadf' },
    { id: 'bg_sunset', type: 'background', name: 'Background Sunset', desc: 'Warm sunset sky', price: 180, purchased: false, color: '#fff1e6' },
    { id: 'bg_neon', type: 'background', name: 'Background Neon', desc: 'Dark neon backdrop', price: 200, purchased: false, color: '#0f0f12' },
    { id: 'bg_space', type: 'background', name: 'Background Space', desc: 'Deep space/violet', price: 210, purchased: false, color: '#070b18' },

    // Platform skins
    { id: 'plat_classic', type: 'platform', name: 'Platform Classic', desc: 'Default platforms', price: 0, purchased: true, color: '#696969' },
    { id: 'plat_moss', type: 'platform', name: 'Platform Moss', desc: 'Mossy stone', price: 110, purchased: false, color: '#6b8e23' },
    { id: 'plat_wood', type: 'platform', name: 'Platform Wood', desc: 'Warm wooden platform', price: 120, purchased: false, color: '#8B4513' },
    { id: 'plat_stone', type: 'platform', name: 'Platform Stone', desc: 'Rough stone look', price: 140, purchased: false, color: '#7d7d7d' },
    { id: 'plat_steel', type: 'platform', name: 'Platform Steel', desc: 'Cool steel platform', price: 160, purchased: false, color: '#2e3545' },
    { id: 'plat_glass', type: 'platform', name: 'Platform Glass', desc: 'Semi-transparent glass', price: 200, purchased: false, color: 'rgba(180,200,230,0.85)' },
    { id: 'plat_gold', type: 'platform', name: 'Platform Gold', desc: 'Shiny gold platform', price: 280, purchased: false, color: '#d4af37' }
];

// Track selected skin id per category
const selectedSkins = {
    player: 'player_classic',
    background: 'bg_classic',
    platform: 'plat_classic'
};

// --- Save / Load progress ---
function getSaveData() {
    return {
        score: score,
        selectedSkins: selectedSkins,
        purchases: shopItems.reduce((acc, it) => { acc[it.id] = !!it.purchased; return acc; }, {}),
        colors: { playerColor, platformColor, bgColor }
    };
}

function saveProgress() {
    try {
        const data = getSaveData();
        localStorage.setItem('htmlGameSave', JSON.stringify(data));
    } catch (e) {
        console.error('Save failed', e);
    }
}

function loadProgress() {
    try {
        const raw = localStorage.getItem('htmlGameSave');
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (typeof data.score === 'number') score = data.score;
        if (data.purchases) {
            for (let it of shopItems) {
                if (data.purchases.hasOwnProperty(it.id)) it.purchased = !!data.purchases[it.id];
            }
        }
        if (data.selectedSkins) {
            for (let k in data.selectedSkins) if (data.selectedSkins[k]) selectedSkins[k] = data.selectedSkins[k];
        }
        if (data.colors) {
            if (data.colors.playerColor) playerColor = data.colors.playerColor;
            if (data.colors.platformColor) platformColor = data.colors.platformColor;
            if (data.colors.bgColor) bgColor = data.colors.bgColor;
        }
        scoreElement.textContent = `Point: ${score}`;
        return true;
    } catch (e) {
        console.error('Load failed', e);
        return false;
    }
}

// Auto-save every 5 seconds
setInterval(saveProgress, 5000);

// current shop page (0 = player, 1 = background, 2 = platform)
let currentShopPage = 0;

function applySkinByCategory(category, color) {
    if (category === 'player') playerColor = color;
    if (category === 'background') bgColor = color;
    if (category === 'platform') platformColor = color;
}

function renderShop() {
    shopItemsDiv.innerHTML = '';
    const categories = ['player', 'background', 'platform'];
    // pagination: show one category per page
    const category = categories[currentShopPage] || categories[0];

    // nav
    const nav = document.createElement('div');
    nav.className = 'shop-nav';
    const prev = document.createElement('button');
    prev.className = 'page-btn';
    prev.textContent = '◀ Prev';
    prev.disabled = currentShopPage === 0;
    prev.addEventListener('click', () => { if (currentShopPage > 0) { currentShopPage--; renderShop(); } });
    const indicator = document.createElement('div');
    indicator.className = 'page-indicator';
    indicator.textContent = `${currentShopPage + 1} / ${categories.length}`;
    const next = document.createElement('button');
    next.className = 'page-btn';
    next.textContent = 'Next ▶';
    next.disabled = currentShopPage >= categories.length - 1;
    next.addEventListener('click', () => { if (currentShopPage < categories.length - 1) { currentShopPage++; renderShop(); } });
    nav.appendChild(prev);
    nav.appendChild(indicator);
    nav.appendChild(next);
    shopItemsDiv.appendChild(nav);

    const header = document.createElement('div');
    header.style.fontWeight = '700';
    header.style.margin = '8px 0 4px';
    header.textContent = category.charAt(0).toUpperCase() + category.slice(1) + ' Skins';
    shopItemsDiv.appendChild(header);

    // Show items sorted by price (cheapest → most expensive)
    const itemsForCat = shopItems
        .filter(i => i.type === category)
        .slice() // copy to avoid mutating original
        .sort((a, b) => (a.price || 0) - (b.price || 0));
    for (let item of itemsForCat) {
        const row = document.createElement('div');
        row.className = 'shop-item';

        const swatch = document.createElement('div');
        swatch.className = 'swatch';
        swatch.style.background = item.color;

        const meta = document.createElement('div');
        meta.className = 'meta';
        const title = document.createElement('div');
        title.textContent = item.name;
        const desc = document.createElement('div');
        desc.style.fontSize = '12px';
        desc.style.opacity = '0.8';
        desc.textContent = item.desc + ` ${item.price > 0 ? '— ' + item.price + ' pt' : ''}`;
        meta.appendChild(title);
        meta.appendChild(desc);

        const leftArea = document.createElement('div');
        leftArea.className = 'left-area';
        leftArea.appendChild(swatch);
        leftArea.appendChild(meta);

        const btn = document.createElement('button');
        btn.className = 'buy-btn';
        btn.textContent = item.purchased ? (selectedSkins[category] === item.id ? 'Selected' : 'Select') : (item.price > 0 ? 'Buy' : 'Select');
        btn.disabled = (!item.purchased && score < item.price);
        btn.addEventListener('click', () => {
            if (!item.purchased) {
                if (score >= item.price) {
                    score -= item.price;
                    item.purchased = true;
                    selectedSkins[category] = item.id;
                    applySkinByCategory(category, item.color);
                    scoreElement.textContent = `Point: ${score}`;
                    saveProgress();
                    renderShop();
                }
            } else {
                // select purchased skin
                selectedSkins[category] = item.id;
                applySkinByCategory(category, item.color);
                saveProgress();
                renderShop();
            }
        });

        row.appendChild(leftArea);
        row.appendChild(btn);
        shopItemsDiv.appendChild(row);
    }
}

// Apply currently selected skins (initial load)
function applySelectedSkins() {
    for (let cat in selectedSkins) {
        const id = selectedSkins[cat];
        const item = shopItems.find(i => i.id === id);
        if (item) applySkinByCategory(cat, item.color);
    }
}

// Load any saved progress from previous sessions (then apply skins)
loadProgress();
applySelectedSkins();

// Save when leaving the page
window.addEventListener('beforeunload', saveProgress);

function openShop() {
    renderShop();
    shopOverlay.classList.add('open');
    shopOverlay.setAttribute('aria-hidden', 'false');
}

function closeShop() {
    shopOverlay.classList.remove('open');
    shopOverlay.setAttribute('aria-hidden', 'true');
}

// (renderShop is defined above for category-based skins)

closeShopBtn.addEventListener('click', closeShop);

// Toggle shop with Q (keyCode 81)
document.addEventListener('keydown', (e) => {
    if (e.keyCode === 81) { // Q
        if (shopOverlay.classList.contains('open')) closeShop(); else openShop();
    }
});

function gameLoop() {
    updatePlayer();
    checkFoodCollision();

    // Update food animations
    for (let food of foods) {
        food.bounceTime += 0.1;
    }

    drawGame();
}

function resetGame() {
    player.x = 100;
    player.y = 50;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.rotation = 0;
    camera.x = 0;
    foods = [];
    platforms = [
        {x: 0, y: canvas.height - 300, width: 400, height: 20},
    ];
    lastPlatformEnd = 400;
    // score persists across deaths
    scoreElement.textContent = `Point: ${score}`;
    for (let i = 0; i < 5; i++) {
        generatePlatform();
    }
    // Add initial foods, max 1 per platform
    for (let platform of platforms) {
        let hasFood = foods.some(f => f.x >= platform.x && f.x < platform.x + platform.width);
        let chance = 0.2 + Math.random() * 0.5;
        if (!hasFood && Math.random() < chance) {
            addFoodToPlatform(platform);
        }
    }
}

document.addEventListener('keydown', (e) => {
    keys[e.keyCode] = true;
});

document.addEventListener('keyup', (e) => {
    keys[e.keyCode] = false;
});

resetGame();
setInterval(gameLoop, 1000 / 60); // 60 FPS