const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// === 1. حل مشكلة الصوت ===
// ننشئ الصوت ولكن لا نشغله إلا داخل دالة startGame
const bgMusic = new Audio('music.mp3'); 
bgMusic.loop = true; 
bgMusic.volume = 0.5;

let width, height;
function resize() {
    width = window.innerWidth; 
    height = window.innerHeight;
    canvas.width = width; 
    canvas.height = height;
}
window.addEventListener('resize', resize); 
resize();

// === متغيرات اللعبة ===
let gameState = 'START'; 
let frame = 0;
let kills = 0;
let shake = 0; // لاهتزاز الشاشة

// === اللاعب ===
const player = {
    x: 0, y: 0, radius: 15, angle: 0,
    hp: 100, maxHp: 100,
    speed: 5,
    level: 1,
    // خصائص السلاح
    bulletDmg: 25,
    bulletSpeed: 14,
    fireRate: 15, // سريع
    bulletCount: 1, 
    spread: 0.1
};

// المصفوفات (إدارة الذاكرة)
let enemies = [];
let bullets = [];
let particles = []; // قللنا استخدامها لتسريع اللعبة
let items = []; // الغنائم على الأرض
let floatingTexts = [];

// === التحكم باللمس ===
const input = {
    active: false,
    sx: 0, sy: 0, 
    cx: 0, cy: 0, 
    dx: 0, dy: 0, 
    id: null
};

// ========================
// نظام الغنائم (Loot System)
// ========================
// هذه هي "المكونات" التي تظهر على الأرض بدلاً من القائمة
const lootTypes = [
    { id: 'heal', color: '#00ff00', text: '+HEALTH', chance: 0.15, apply: () => { player.hp = Math.min(player.maxHp, player.hp + 40); } },
    { id: 'dmg', color: '#ff0000', text: '+DAMAGE', chance: 0.1, apply: () => { player.bulletDmg += 5; player.level++; } },
    { id: 'multi', color: '#00ffff', text: '+MULTI SHOT', chance: 0.05, apply: () => { player.bulletCount++; player.spread += 0.05; player.level++; } },
    { id: 'speed', color: '#ffff00', text: '+FIRE RATE', chance: 0.1, apply: () => { player.fireRate = Math.max(4, player.fireRate - 1); player.level++; } }
];

class ItemDrop {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.radius = 12; // حجم العنصر
        this.magnet = false;
        
        // اختيار نوع الغرض عشوائياً
        this.type = lootTypes[0]; // افتراضي علاج
        let r = Math.random();
        
        // منطق الاحتمالات
        if(r < 0.05) this.type = lootTypes[2]; // Multishot (نادر)
        else if(r < 0.15) this.type = lootTypes[3]; // Speed
        else if(r < 0.30) this.type = lootTypes[1]; // Damage
        else this.type = lootTypes[0]; // Heal (شائع)
        
        this.color = this.type.color;
    }

    update() {
        // مغناطيس: ينجذب للاعب إذا اقترب
        let dx = player.x - this.x; 
        let dy = player.y - this.y;
        let dist = Math.hypot(dx, dy);
        
        if(dist < 150) this.magnet = true;
        
        if(this.magnet) {
            this.x += (dx/dist) * 12; // يطير نحو اللاعب
            this.y += (dy/dist) * 12;
        }

        // التقاط الغرض
        if(dist < player.radius + this.radius) {
            this.type.apply(); // تطبيق الترقية فوراً
            createFloatingText(player.x, player.y - 40, this.type.text, this.type.color, 20);
            return true; // يجب حذفه
        }
        return false;
    }

    draw() {
        // رسم مربع بسيط للأداء العالي
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - 6, this.y - 6, 12, 12);
        // إطار أبيض
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.strokeRect(this.x - 6, this.y - 6, 12, 12);
    }
}

// ========================
// الكائنات
// ========================
class Enemy {
    constructor() {
        // تحديد النوع عشوائياً مع زيادة الصعوبة
        let r = Math.random();
        this.type = 0; // عادي
        if(kills > 20 && r < 0.2) this.type = 1; // سريع
        if(kills > 50 && r < 0.1) this.type = 2; // ضخم (Tank)

        let angle = Math.random() * Math.PI * 2;
        let dist = Math.max(width, height) * 0.7; // يظهرون بعيداً
        this.x = player.x + Math.cos(angle) * dist;
        this.y = player.y + Math.sin(angle) * dist;

        if(this.type === 0) { // عادي
            this.hp = 30 + (kills * 0.5); this.speed = 2.5; 
            this.radius = 15; this.color = '#ff0055';
        } else if(this.type === 1) { // سريع
            this.hp = 20 + (kills * 0.2); this.speed = 4.5; 
            this.radius = 10; this.color = '#ffff00';
        } else { // ضخم
            this.hp = 100 + (kills * 2); this.speed = 1.5; 
            this.radius = 25; this.color = '#aa00ff';
        }
    }

    update() {
        let dx = player.x - this.x;
        let dy = player.y - this.y;
        let dist = Math.hypot(dx, dy);
        let angle = Math.atan2(dy, dx);

        this.x += Math.cos(angle) * this.speed;
        this.y += Math.sin(angle) * this.speed;

        // تلامس مع اللاعب
        if(dist < this.radius + player.radius) {
            player.hp -= 0.5; // ضرر مستمر
            shake = 3;
        }
    }

    draw() {
        // رسم بسيط جداً بدون ظلال للأداء
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2); ctx.fill();
        // عين للعدو
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius/3, 0, Math.PI*2); ctx.fill();
    }
}

class FloatingText {
    constructor(x, y, text, color, size) {
        this.x = x; this.y = y; this.text = text; this.color = color; this.size = size;
        this.life = 40; 
    }
    update() { this.y -= 1; this.life--; return this.life <= 0; }
    draw() {
        ctx.fillStyle = this.color; 
        ctx.font = `bold ${this.size}px Arial`; // Arial أسرع في الرسم
        ctx.fillText(this.text, this.x, this.y);
    }
}

function createFloatingText(x, y, text, color, size=14) {
    floatingTexts.push(new FloatingText(x, y, text, color, size));
}

// ========================
// تشغيل اللعبة
// ========================
function startGame() {
    // 1. تشغيل الصوت فوراً عند الضغط
    bgMusic.play().catch(e => console.log("Audio Error:", e));
    
    document.getElementById('start-screen').style.display = 'none';
    
    // ريستارت المتغيرات
    player.x = width/2; player.y = height/2;
    player.hp = 100; player.level = 1;
    // إعادة قوة السلاح
    player.bulletDmg = 25; player.fireRate = 15; player.bulletCount = 1;

    enemies = []; bullets = []; items = []; floatingTexts = [];
    kills = 0; frame = 0;
    
    gameState = 'PLAY';
    loop();
}

function loop() {
    if(gameState !== 'PLAY') return;
    requestAnimationFrame(loop);
    frame++;

    // مسح الشاشة (بدون شفافية لتسريع الأداء)
    ctx.fillStyle = '#050505'; 
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // اهتزاز الشاشة
    if(shake > 0) {
        ctx.translate((Math.random()-0.5)*shake, (Math.random()-0.5)*shake);
        shake *= 0.9;
        if(shake < 0.5) shake = 0;
    }

    // 1. Spawner (ظهور الأعداء)
    // كلما زاد القتل، زاد عدد الأعداء في الشاشة
    let maxEnemies = 5 + Math.floor(kills / 5);
    if(enemies.length < maxEnemies) {
        if(Math.random() < 0.05) enemies.push(new Enemy());
    }

    // 2. تحديث اللاعب والحركة
    if(input.active) {
        player.x += input.dx * player.speed;
        player.y += input.dy * player.speed;
        // حدود
        player.x = Math.max(15, Math.min(width-15, player.x));
        player.y = Math.max(15, Math.min(height-15, player.y));

        // إطلاق نار تلقائي
        if(frame % player.fireRate === 0) {
            // البحث عن أقرب عدو
            let nearest = null, minDist = 9999;
            for(let e of enemies) {
                let d = Math.hypot(e.x - player.x, e.y - player.y);
                if(d < minDist) { minDist = d; nearest = e; }
            }
            
            let angle = 0;
            // إذا وجد عدو قريب يصوب عليه، وإلا يصوب حسب الحركة
            if(nearest && minDist < 400) {
                angle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
            } else if (input.dx || input.dy) {
                angle = Math.atan2(input.dy, input.dx);
            }

            // إطلاق الرصاص
            for(let i=0; i<player.bulletCount; i++) {
                let offset = (i - (player.bulletCount-1)/2) * player.spread;
                bullets.push({
                    x: player.x, y: player.y,
                    vx: Math.cos(angle+offset)*player.bulletSpeed,
                    vy: Math.sin(angle+offset)*player.bulletSpeed,
                    life: 60
                });
            }
        }
    }

    // 3. رسم اللاعب
    ctx.fillStyle = '#00f3ff';
    ctx.beginPath(); ctx.arc(player.x, player.y, player.radius, 0, Math.PI*2); ctx.fill();

    // 4. تحديث ورسم الأغراض (Items)
    for(let i=items.length-1; i>=0; i--) {
        items[i].draw();
        if(items[i].update()) items.splice(i, 1);
    }

    // 5. تحديث الأعداء
    for(let e of enemies) {
        e.update(); e.draw();
    }

    // 6. تحديث الرصاص والتصادم
    ctx.fillStyle = '#00f3ff'; // لون الرصاص موحد للأداء
    for(let i=bullets.length-1; i>=0; i--) {
        let b = bullets[i];
        b.x += b.vx; b.y += b.vy; b.life--;
        
        ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI*2); ctx.fill();

        if(b.life <= 0) { bullets.splice(i,1); continue; }

        // فحص التصادم مع الأعداء
        let hit = false;
        for(let j=enemies.length-1; j>=0; j--) {
            let e = enemies[j];
            let dx = b.x - e.x; let dy = b.y - e.y;
            if(dx*dx + dy*dy < (e.radius+4)*(e.radius+4)) { // حساب مسافة سريع
                e.hp -= player.bulletDmg;
                hit = true;
                if(e.hp <= 0) {
                    kills++;
                    // فرصة 30% لسقوط غرض
                    if(Math.random() < 0.3) items.push(new ItemDrop(e.x, e.y));
                    enemies.splice(j, 1);
                }
                break; 
            }
        }
        if(hit) bullets.splice(i, 1);
    }

    // 7. النصوص العائمة
    for(let i=floatingTexts.length-1; i>=0; i--) {
        floatingTexts[i].draw();
        if(floatingTexts[i].update()) floatingTexts.splice(i, 1);
    }

    ctx.restore();

    // تحديث الواجهة
    updateHUD();

    // الموت
    if(player.hp <= 0) {
        gameState = 'OVER';
        document.getElementById('final-score').innerText = kills;
        document.getElementById('game-over-screen').style.display = 'flex';
    }

    // رسم عصا التحكم
    if(input.active) {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(input.sx, input.sy, 50, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = 'rgba(0, 243, 255, 0.5)';
        ctx.beginPath(); ctx.arc(input.cx, input.cy, 25, 0, Math.PI*2); ctx.fill();
    }
}

function updateHUD() {
    document.getElementById('kill-count').innerText = kills;
    document.getElementById('lvl-txt').innerText = player.level;
    let hpPerc = Math.max(0, (player.hp / player.maxHp) * 100);
    document.getElementById('hp-fill').style.width = hpPerc + "%";
}

// === مدخلات اللمس ===
window.addEventListener('touchstart', e => {
    if(e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    if(!input.active && gameState === 'PLAY') {
        let t = e.changedTouches[0];
        input.active = true; input.id = t.identifier;
        input.sx = t.clientX; input.sy = t.clientY;
        input.cx = t.clientX; input.cy = t.clientY;
    }
}, {passive: false});

window.addEventListener('touchmove', e => {
    if(gameState !== 'PLAY') return;
    e.preventDefault();
    for(let i=0; i<e.changedTouches.length; i++) {
        if(e.changedTouches[i].identifier === input.id) {
            let t = e.changedTouches[i];
            let dx = t.clientX - input.sx; let dy = t.clientY - input.sy;
            let dist = Math.min(50, Math.hypot(dx, dy));
            let angle = Math.atan2(dy, dx);
            input.cx = input.sx + Math.cos(angle) * dist;
            input.cy = input.sy + Math.sin(angle) * dist;
            input.dx = Math.cos(angle) * (dist/50);
            input.dy = Math.sin(angle) * (dist/50);
        }
    }
}, {passive: false});

window.addEventListener('touchend', e => {
    for(let i=0; i<e.changedTouches.length; i++) {
        if(e.changedTouches[i].identifier === input.id) {
            input.active = false; input.dx = 0; input.dy = 0;
        }
    }
});
